import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RsvpStatus } from "../contracts";

const votesPath = (): string =>
  process.env.RSVP_PERSIST_PATH
    ? resolve(process.env.RSVP_PERSIST_PATH)
    : resolve(process.cwd(), "data", "rsvp-votes.json");

type Persisted = Record<string, Record<string, RsvpStatus>>;

let cache: Map<string, Map<string, RsvpStatus>> | null = null;

const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

const toMaps = (raw: Persisted): Map<string, Map<string, RsvpStatus>> => {
  const m = new Map<string, Map<string, RsvpStatus>>();
  for (const [eventId, byHash] of Object.entries(raw)) {
    m.set(eventId, new Map(Object.entries(byHash)));
  }
  return m;
};

const toPersisted = (maps: Map<string, Map<string, RsvpStatus>>): Persisted => {
  const o: Persisted = {};
  for (const [eventId, byHash] of maps) {
    o[eventId] = Object.fromEntries(byHash) as Record<string, RsvpStatus>;
  }
  return o;
};

const load = (): void => {
  if (cache !== null) {
    return;
  }
  const p = votesPath();
  if (!existsSync(p)) {
    cache = new Map();
    return;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Persisted;
    cache = toMaps(raw);
  } catch {
    cache = new Map();
  }
};

const persist = (): void => {
  if (cache === null) {
    return;
  }
  const p = votesPath();
  const dir = dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(p, JSON.stringify(toPersisted(cache), null, 0) + "\n", "utf8");
};

export const getVotes = (): Map<string, Map<string, RsvpStatus>> => {
  load();
  return cache!;
};

export const setVote = (eventId: string, anonymousToken: string, status: RsvpStatus): void => {
  load();
  const h = hashToken(anonymousToken);
  const byEvent = cache!.get(eventId) ?? new Map<string, RsvpStatus>();
  byEvent.set(h, status);
  cache!.set(eventId, byEvent);
  persist();
};

export const deleteVote = (eventId: string, anonymousToken: string): void => {
  load();
  const h = hashToken(anonymousToken);
  const byEvent = cache!.get(eventId);
  if (!byEvent) {
    return;
  }
  byEvent.delete(h);
  if (byEvent.size === 0) {
    cache!.delete(eventId);
  } else {
    cache!.set(eventId, byEvent);
  }
  persist();
};

export const _resetCacheForTesting = (): void => {
  cache = null;
  const p = votesPath();
  if (existsSync(p)) unlinkSync(p);
};

export const getVotesForToken = (anonymousToken: string): Map<string, RsvpStatus> => {
  load();
  const hashed = hashToken(anonymousToken);
  const mine = new Map<string, RsvpStatus>();
  for (const [eventId, byEvent] of cache!) {
    const status = byEvent.get(hashed);
    if (status) {
      mine.set(eventId, status);
    }
  }
  return mine;
};
