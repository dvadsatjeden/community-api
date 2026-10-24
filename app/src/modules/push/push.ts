import webPush from "web-push";
import type { EventItem } from "../contracts.js";
import { getDatabase } from "../../storage/database.js";

type PushSub = webPush.PushSubscription;
let vapidReady = false;

const initVapid = (): boolean => {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webPush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@dvadsatjeden.org", pub, priv);
  vapidReady = true;
  return true;
};
export const getVapidPublicKey = (): string | null =>
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;

export function saveSubscription(sub: PushSub): void {
  getDatabase().prepare(`INSERT INTO push_subscriptions VALUES (?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET data = excluded.data`).run(sub.endpoint, JSON.stringify(sub));
}
export function removeSubscription(endpoint: string): void {
  getDatabase().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}
export const getSubscriptionCount = (): number => Number(getDatabase().prepare("SELECT count(*) AS count FROM push_subscriptions").get()!.count);

export async function notifyNewEvents(events: EventItem[]): Promise<void> {
  if (!getSubscriptionCount() || !initVapid()) return;
  const db = getDatabase();
  // Bound concurrency and record each delivery only after success, so transient failures retry on the next import.
  const subscriptions = db.prepare("SELECT data FROM push_subscriptions").all().map(row => JSON.parse(String(row.data)) as PushSub);
  for (const sub of subscriptions) {
    const upcoming = events.filter(event => new Date(event.startsAt).getTime() > Date.now() &&
      !db.prepare("SELECT 1 FROM push_deliveries WHERE event_id = ? AND endpoint = ?").get(event.id, sub.endpoint));
    if (!upcoming.length) continue;
    const payload = JSON.stringify({
      title: upcoming.length === 1 ? upcoming[0].title : `${upcoming.length} nové udalosti`,
      body: upcoming.length === 1 ? upcoming[0].locationName ?? "Nová udalosť" : upcoming.slice(0, 3).map(event => event.title).join(" · "),
      url: upcoming.length === 1 ? `/?event=${encodeURIComponent(upcoming[0].id)}` : "/",
    });
    try {
      await webPush.sendNotification(sub, payload, { timeout: 10_000 });
      const insert = db.prepare("INSERT OR IGNORE INTO push_deliveries VALUES (?, ?)");
      for (const event of upcoming) insert.run(event.id, sub.endpoint);
    } catch (error) {
      if (error instanceof webPush.WebPushError && [404, 410].includes(error.statusCode)) removeSubscription(sub.endpoint);
    }
  }
}

export async function sendTestNotification(sub: PushSub): Promise<void> {
  if (!initVapid()) throw new Error("VAPID not configured");
  await webPush.sendNotification(sub, JSON.stringify({ title: "Dvadsatjeden Community", body: "Push notifikácie fungujú!", url: "/" }), { timeout: 10_000 });
}

export function _resetForTesting(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Test reset outside test environment");
  getDatabase().exec("DELETE FROM push_subscriptions");
  vapidReady = false;
}
