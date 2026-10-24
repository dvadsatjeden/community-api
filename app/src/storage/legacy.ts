import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { getDatabase, readSnapshot, transaction, writeSnapshot } from "./database.js";

/** One-time, all-or-nothing import. Originals remain untouched for rollback. Invalid JSON stops startup. */
export function importLegacyData(): void {
  if (readSnapshot("legacy-imported")) return;
  const root = process.env.LEGACY_DATA_DIR ?? resolve(process.cwd(), "data");
  const read = (env: string, name: string): unknown => {
    const path = process.env[env] ?? resolve(root, name);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  };
  const votes = read("RSVP_PERSIST_PATH", "rsvp-votes.json");
  const ideas = read("IDEAS_PERSIST_PATH", "ideas-data.json");
  const subscriptions = read("PUSH_SUBSCRIPTIONS_PATH", "push-subscriptions.json");
  const geocoding = read("GEOCODE_CACHE_PATH", "geocode-cache.json");
  transaction(() => {
    const db = getDatabase();
    if (votes !== null) {
      const parsed = z.record(z.string(), z.record(z.string().regex(/^[a-f0-9]{64}$/), z.enum(["going", "maybe", "not_going"]))).parse(votes);
      const insert = db.prepare("INSERT OR IGNORE INTO rsvp VALUES (?, ?, ?)");
      for (const [id, byToken] of Object.entries(parsed)) for (const [hash, status] of Object.entries(byToken)) insert.run(id, hash, status);
    }
    if (ideas !== null) {
      const item = z.object({ id: z.string(), authorTokenHash: z.string(), authorOwnerId: z.string() }).passthrough();
      const comment = item.extend({ ideaId: z.string() });
      const parsed = z.object({ ideas: z.array(item), comments: z.array(comment), upvotes: z.record(z.string(), z.record(z.string(), z.literal(true))) }).parse(ideas);
      for (const idea of parsed.ideas) db.prepare("INSERT OR IGNORE INTO ideas VALUES (?, ?)").run(idea.id, JSON.stringify(idea));
      for (const entry of parsed.comments) db.prepare("INSERT OR IGNORE INTO comments VALUES (?, ?, ?)").run(entry.id, entry.ideaId, JSON.stringify(entry));
      for (const [id, hashes] of Object.entries(parsed.upvotes)) for (const hash of Object.keys(hashes)) db.prepare("INSERT OR IGNORE INTO upvotes VALUES (?, ?)").run(id, hash);
    }
    if (subscriptions !== null) {
      const parsed = z.array(z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).passthrough()).parse(subscriptions);
      for (const subscription of parsed) db.prepare("INSERT OR IGNORE INTO push_subscriptions VALUES (?, ?)").run(subscription.endpoint, JSON.stringify(subscription));
    }
    if (geocoding !== null) writeSnapshot("geocoding", z.record(z.string(), z.tuple([z.number(), z.number()])).parse(geocoding));
    writeSnapshot("legacy-imported", { completedAt: new Date().toISOString() });
  });
}
