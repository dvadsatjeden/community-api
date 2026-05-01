import type { RedisClientType } from "redis";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Redis `EX` and max `created_at` skew for verify (must match challenge lifetime). */
export const CHALLENGE_TTL_SEC = Math.ceil(CHALLENGE_TTL_MS / 1000);
const REDIS_KEY_PREFIX = "d21:nostr:challenge:";

export interface NostrChallengeStore {
  setChallenge(id: string): Promise<void>;
  /** Returns true if the challenge existed and was not expired (and is consumed). */
  consumeChallenge(id: string): Promise<boolean>;
  resetForTesting(): Promise<void>;
}

/** Process-local TTL map (default when `REDIS_URL` is unset). */
export class MemoryNostrChallengeStore implements NostrChallengeStore {
  private readonly challenges = new Map<string, number>();

  private prune(): void {
    const now = Date.now();
    for (const [id, exp] of this.challenges) {
      if (exp < now) this.challenges.delete(id);
    }
  }

  async setChallenge(id: string): Promise<void> {
    this.prune();
    this.challenges.set(id, Date.now() + CHALLENGE_TTL_MS);
  }

  async consumeChallenge(id: string): Promise<boolean> {
    this.prune();
    const exp = this.challenges.get(id);
    if (!exp || exp < Date.now()) {
      this.challenges.delete(id);
      return false;
    }
    this.challenges.delete(id);
    return true;
  }

  async resetForTesting(): Promise<void> {
    this.challenges.clear();
  }
}

/** Shared store when `REDIS_URL` is set (multi-instance / restart-safe TTL via Redis `EX`). */
export class RedisNostrChallengeStore implements NostrChallengeStore {
  constructor(private readonly client: RedisClientType) {}

  async setChallenge(id: string): Promise<void> {
    await this.client.set(`${REDIS_KEY_PREFIX}${id}`, "1", { EX: CHALLENGE_TTL_SEC });
  }

  async consumeChallenge(id: string): Promise<boolean> {
    const v = await this.client.getDel(`${REDIS_KEY_PREFIX}${id}`);
    return v !== null;
  }

  async resetForTesting(): Promise<void> {
    const keys = await this.client.keys(`${REDIS_KEY_PREFIX}*`);
    if (keys.length > 0) await this.client.del(keys);
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

let cachedStore: NostrChallengeStore | null = null;
let initPromise: Promise<NostrChallengeStore> | null = null;

async function createStore(): Promise<NostrChallengeStore> {
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    const { createClient } = await import("redis");
    const client = createClient({ url }) as RedisClientType;
    client.on("error", (err: Error) => {
      console.error("[nostr-auth] Redis:", err.message);
    });
    await client.connect();
    return new RedisNostrChallengeStore(client);
  }
  return new MemoryNostrChallengeStore();
}

export async function getNostrChallengeStore(): Promise<NostrChallengeStore> {
  if (cachedStore) return cachedStore;
  if (!initPromise) {
    initPromise = createStore()
      .then((s) => {
        cachedStore = s;
        return s;
      })
      .catch((err: unknown) => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

/**
 * Clears pending challenges and drops the singleton so the next request picks
 * `REDIS_URL` again (Vitest clears Redis env to force in-memory store).
 */
export async function _resetNostrChallengeStoreForTesting(): Promise<void> {
  if (cachedStore instanceof RedisNostrChallengeStore) {
    await cachedStore.resetForTesting();
    await cachedStore.disconnect();
  } else if (cachedStore instanceof MemoryNostrChallengeStore) {
    await cachedStore.resetForTesting();
  }
  cachedStore = null;
  initPromise = null;
}
