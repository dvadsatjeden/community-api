import { beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.PUSH_SUBSCRIPTIONS_PATH = join(tmpdir(), `push-subs-${randomUUID()}.json`);
process.env.PUSH_NOTIFIED_PATH = join(tmpdir(), `push-notified-${randomUUID()}.json`);

import { _resetForTesting, getSubscriptionCount, getVapidPublicKey, notifyNewEvents, removeSubscription, saveSubscription } from "./push";
import type { EventItem } from "../contracts";

const fakeSub = (n = 1) => ({
  endpoint: `https://push.example.com/sub${n}`,
  keys: { p256dh: "abc", auth: "def" },
});

const futureEvent = (id: string): EventItem => ({
  id,
  title: `Event ${id}`,
  startsAt: new Date(Date.now() + 86400_000).toISOString(),
});

beforeEach(() => {
  _resetForTesting();
  vi.restoreAllMocks();
});

describe("saveSubscription / getSubscriptionCount", () => {
  it("starts empty", () => {
    expect(getSubscriptionCount()).toBe(0);
  });

  it("adds a subscription", () => {
    saveSubscription(fakeSub(1) as Parameters<typeof saveSubscription>[0]);
    expect(getSubscriptionCount()).toBe(1);
  });

  it("deduplicates by endpoint", () => {
    saveSubscription(fakeSub(1) as Parameters<typeof saveSubscription>[0]);
    saveSubscription(fakeSub(1) as Parameters<typeof saveSubscription>[0]);
    expect(getSubscriptionCount()).toBe(1);
  });

  it("counts multiple unique subscriptions", () => {
    saveSubscription(fakeSub(1) as Parameters<typeof saveSubscription>[0]);
    saveSubscription(fakeSub(2) as Parameters<typeof saveSubscription>[0]);
    expect(getSubscriptionCount()).toBe(2);
  });
});

describe("removeSubscription", () => {
  it("removes by endpoint", () => {
    saveSubscription(fakeSub(1) as Parameters<typeof saveSubscription>[0]);
    removeSubscription(fakeSub(1).endpoint);
    expect(getSubscriptionCount()).toBe(0);
  });

  it("is a no-op for unknown endpoint", () => {
    saveSubscription(fakeSub(1) as Parameters<typeof saveSubscription>[0]);
    removeSubscription("https://push.example.com/ghost");
    expect(getSubscriptionCount()).toBe(1);
  });
});

describe("getVapidPublicKey", () => {
  it("returns null when not set", () => {
    const orig = process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    expect(getVapidPublicKey()).toBeNull();
    process.env.VAPID_PUBLIC_KEY = orig;
  });

  it("returns the key when set", () => {
    process.env.VAPID_PUBLIC_KEY = "test-key";
    expect(getVapidPublicKey()).toBe("test-key");
  });
});

describe("notifyNewEvents", () => {
  it("does nothing when there are no subscribers", async () => {
    // No VAPID env vars needed — exits early because subscriber count is 0
    await expect(notifyNewEvents([futureEvent("e1")])).resolves.toBeUndefined();
  });

  it("skips past events (only future events trigger notifications)", async () => {
    saveSubscription(fakeSub(1) as Parameters<typeof saveSubscription>[0]);
    const pastEvent: EventItem = {
      id: "past",
      title: "Past event",
      startsAt: new Date(Date.now() - 86400_000).toISOString(),
    };
    // Should not throw even with no VAPID config — exits before reaching web-push
    // because past events are filtered out before VAPID check
    await expect(notifyNewEvents([pastEvent])).resolves.toBeUndefined();
  });
});
