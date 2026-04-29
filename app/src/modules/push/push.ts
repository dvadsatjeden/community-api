import webPush from "web-push";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { EventItem } from "../contracts";

type PushSub = webPush.PushSubscription;

let subscriptions: PushSub[] | null = null;
let notifiedIds: Set<string> | null = null;
let vapidReady = false;

// ── paths ────────────────────────────────────────────────────────────────────

const subsPath = (): string =>
  process.env.PUSH_SUBSCRIPTIONS_PATH
    ? resolve(process.env.PUSH_SUBSCRIPTIONS_PATH)
    : resolve(process.cwd(), "data", "push-subscriptions.json");

const notifiedPath = (): string =>
  process.env.PUSH_NOTIFIED_PATH
    ? resolve(process.env.PUSH_NOTIFIED_PATH)
    : resolve(process.cwd(), "data", "push-notified.json");

// ── VAPID ────────────────────────────────────────────────────────────────────

const initVapid = (): boolean => {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@dvadsatjeden.org";
  if (!pub || !priv) return false;
  webPush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
};

export const getVapidPublicKey = (): string | null =>
  process.env.VAPID_PUBLIC_KEY ?? null;

// ── subscription store ────────────────────────────────────────────────────────

const loadSubs = (): void => {
  if (subscriptions !== null) return;
  const p = subsPath();
  if (!existsSync(p)) { subscriptions = []; return; }
  try { subscriptions = JSON.parse(readFileSync(p, "utf8")) as PushSub[]; }
  catch { subscriptions = []; }
};

const persistSubs = (): void => {
  if (!subscriptions) return;
  const p = subsPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(subscriptions) + "\n", "utf8");
};

export const saveSubscription = (sub: PushSub): void => {
  loadSubs();
  const idx = subscriptions!.findIndex((s) => s.endpoint === sub.endpoint);
  if (idx >= 0) subscriptions![idx] = sub;
  else subscriptions!.push(sub);
  persistSubs();
};

export const removeSubscription = (endpoint: string): void => {
  loadSubs();
  subscriptions = subscriptions!.filter((s) => s.endpoint !== endpoint);
  persistSubs();
};

export const getSubscriptionCount = (): number => {
  loadSubs();
  return subscriptions!.length;
};

// ── notified-IDs store ────────────────────────────────────────────────────────

const loadNotified = (): void => {
  if (notifiedIds !== null) return;
  const p = notifiedPath();
  if (!existsSync(p)) { notifiedIds = new Set(); return; }
  try { notifiedIds = new Set(JSON.parse(readFileSync(p, "utf8")) as string[]); }
  catch { notifiedIds = new Set(); }
};

const persistNotified = (): void => {
  if (!notifiedIds) return;
  const p = notifiedPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify([...notifiedIds]) + "\n", "utf8");
};

// ── notify ────────────────────────────────────────────────────────────────────

export const notifyNewEvents = async (events: EventItem[]): Promise<void> => {
  loadSubs();
  loadNotified();
  if (subscriptions!.length === 0 || !initVapid()) return;

  const now = Date.now();
  const newEvents = events.filter(
    (e) => !notifiedIds!.has(e.id) && new Date(e.startsAt).getTime() > now
  );
  if (newEvents.length === 0) return;

  for (const e of newEvents) notifiedIds!.add(e.id);
  persistNotified();

  const payload =
    newEvents.length === 1
      ? JSON.stringify({
          title: newEvents[0].title,
          body: newEvents[0].locationName ?? "Nová udalosť",
          url: newEvents[0].sourceUrl ?? "/",
        })
      : JSON.stringify({
          title: `${newEvents.length} nové udalosti`,
          body: newEvents.map((e) => e.title).slice(0, 3).join(" · "),
          url: "/",
        });

  const dead: string[] = [];
  await Promise.allSettled(
    subscriptions!.map(async (sub) => {
      try {
        await webPush.sendNotification(sub, payload);
      } catch (err) {
        if (err instanceof webPush.WebPushError && (err.statusCode === 410 || err.statusCode === 404)) {
          dead.push(sub.endpoint);
        }
      }
    })
  );

  if (dead.length > 0) {
    subscriptions = subscriptions!.filter((s) => !dead.includes(s.endpoint));
    persistSubs();
  }
};

export const sendTestNotification = async (sub: PushSub): Promise<void> => {
  if (!initVapid()) throw new Error("VAPID not configured");
  await webPush.sendNotification(
    sub,
    JSON.stringify({ title: "Dvadsatjeden Community", body: "Push notifikácie fungujú!", url: "/" })
  );
};

export const _resetForTesting = (): void => {
  subscriptions = null;
  notifiedIds = null;
  vapidReady = false;
  try { if (existsSync(subsPath())) unlinkSync(subsPath()); } catch { /* ignore */ }
  try { if (existsSync(notifiedPath())) unlinkSync(notifiedPath()); } catch { /* ignore */ }
};
