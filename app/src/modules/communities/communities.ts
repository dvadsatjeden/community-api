import { createHash } from "node:crypto";
import { z } from "zod";
import { readSnapshot, transaction, writeSnapshot } from "../../storage/database.js";

const communitySchema = z.object({
  id: z.union([z.string().min(1).max(200), z.number().int()]).optional(),
  name: z.string().trim().min(1).max(200),
  url: z.url().refine(value => {
    try { const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  }, "Invalid community link"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  marker_image: z.union([z.url().refine(value => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }), z.literal("")]).optional(),
});
export type Community = z.infer<typeof communitySchema> & { id: string };
export type CommunitySyncStatus = { lastRunAt: string | null; lastSuccessAt: string | null; lastError: string | null; recordsImported: number };
const defaults = (): CommunitySyncStatus => ({ lastRunAt: null, lastSuccessAt: null, lastError: null, recordsImported: 0 });
export const getCommunitySyncStatus = (): CommunitySyncStatus => readSnapshot<CommunitySyncStatus>("communities-status") ?? defaults();
export const communitySourceUrl = (): string => process.env.COMMUNITIES_SOURCE_URL ?? "https://www.dvadsatjeden.org/wp-json/community-map/v1/communities";
const ttl = (): number => Number(process.env.COMMUNITIES_INTERVAL_MINUTES ?? 15) * 60_000;
let pending: Promise<Community[]> | undefined;

export function normalizeCommunities(payload: unknown): Community[] {
  // An explicit empty array is a successful removal of all communities. Malformed data must never erase the snapshot.
  const raw = Array.isArray(payload) ? payload : z.object({ items: z.array(z.unknown()) }).parse(payload).items;
  const items = z.array(communitySchema).max(5000).parse(raw);
  const ids = new Set<string>();
  return items.map(item => {
    const identity = item.id === undefined ? `${item.name.toLowerCase()}|${item.lat}|${item.lng}` : String(item.id);
    const id = createHash("sha256").update(identity).digest("hex").slice(0, 24);
    if (ids.has(id)) throw new Error("Duplicate community identity in source");
    ids.add(id);
    return { ...item, id };
  });
}

export async function refreshCommunities(): Promise<Community[]> {
  if (pending) return pending;
  pending = (async () => {
    const lastRunAt = new Date().toISOString();
    try {
      const response = await fetch(communitySourceUrl(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Community source HTTP ${response.status}`);
      const items = normalizeCommunities(await response.json());
      transaction(() => {
        writeSnapshot("communities", items);
        writeSnapshot("communities-status", { lastRunAt, lastSuccessAt: new Date().toISOString(), lastError: null, recordsImported: items.length });
      });
      return items;
    } catch (error) {
      // Do not expose source URLs (which may contain credentials) in public status.
      writeSnapshot("communities-status", { ...getCommunitySyncStatus(), lastRunAt, lastError: "community_source_unavailable" });
      throw error;
    }
  })();
  try { return await pending; } finally { pending = undefined; }
}

export async function getCommunities(): Promise<Community[]> {
  const cached = readSnapshot<Community[]>("communities");
  const status = getCommunitySyncStatus();
  if (!status.lastRunAt || Date.now() - Date.parse(status.lastRunAt) >= ttl()) {
    if (cached !== null) {
      void refreshCommunities().catch(() => {});
      return cached;
    }
    return refreshCommunities();
  }
  if (cached === null) throw new Error("Community source unavailable");
  return cached;
}

export async function getCommunityUrl(id: string): Promise<string | null> {
  const items = await getCommunities();
  return items.find(item => item.id === id)?.url ?? null;
}
