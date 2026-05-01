import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { nip19, verifyEvent, type Event } from "nostr-tools";
import { deriveNostrCredentials } from "./nostr-crypto";

/** Custom auth event kind for Dvadsatjeden community-api (documented in API_CONTRACTS). */
export const NOSTR_AUTH_EVENT_KIND = 27241;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_EVENT_AGE_SEC = 10 * 60;

const challenges = new Map<string, number>();

function getSecret(): string | null {
  const s = process.env.NOSTR_AUTH_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

export function isNostrAuthConfigured(): boolean {
  return getSecret() !== null;
}

function pruneChallenges(): void {
  const now = Date.now();
  for (const [id, exp] of challenges) {
    if (exp < now) challenges.delete(id);
  }
}

function extractChallengeTag(event: Event): string | null {
  for (const t of event.tags) {
    if (t[0] === "challenge" && typeof t[1] === "string" && t[1].length > 0) {
      return t[1];
    }
  }
  return null;
}

export function nostrAuthChallengeGet(_req: Request, res: Response): void {
  const secret = getSecret();
  if (!secret) {
    res.status(503).json({ error: "nostr_auth_not_configured" });
    return;
  }
  pruneChallenges();
  const challengeId = randomBytes(16).toString("hex");
  challenges.set(challengeId, Date.now() + CHALLENGE_TTL_MS);
  res.json({
    challengeId,
    kind: NOSTR_AUTH_EVENT_KIND,
    message: "Sign this challenge with your Nostr key to log in.",
  });
}

export function nostrAuthVerifyPost(req: Request, res: Response): void {
  const secret = getSecret();
  if (!secret) {
    res.status(503).json({ error: "nostr_auth_not_configured" });
    return;
  }

  const body = req.body as { event?: Event } | null;
  const event = body?.event;
  if (!event || typeof event !== "object") {
    res.status(400).json({ error: "event is required" });
    return;
  }

  if (!verifyEvent(event)) {
    res.status(400).json({ error: "invalid_event_signature" });
    return;
  }

  if (event.kind !== NOSTR_AUTH_EVENT_KIND) {
    res.status(400).json({ error: "invalid_event_kind" });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof event.created_at !== "number" || Math.abs(nowSec - event.created_at) > MAX_EVENT_AGE_SEC) {
    res.status(400).json({ error: "invalid_event_time" });
    return;
  }

  const challengeId = extractChallengeTag(event);
  if (!challengeId) {
    res.status(400).json({ error: "missing_challenge_tag" });
    return;
  }

  pruneChallenges();
  const exp = challenges.get(challengeId);
  if (!exp || exp < Date.now()) {
    res.status(400).json({ error: "unknown_or_expired_challenge" });
    return;
  }
  challenges.delete(challengeId);

  const pubkeyHex = event.pubkey?.trim().toLowerCase();
  if (!pubkeyHex || !/^[0-9a-f]{64}$/.test(pubkeyHex)) {
    res.status(400).json({ error: "invalid_pubkey" });
    return;
  }

  try {
    const cred = deriveNostrCredentials(secret, pubkeyHex);
    let npub: string;
    try {
      npub = nip19.npubEncode(pubkeyHex);
    } catch {
      npub = "";
    }
    res.json({
      ownerId: cred.ownerId,
      rsvpToken: cred.rsvpToken,
      dataKey: cred.dataKey,
      mnemonic: cred.mnemonic,
      nostrPubkeyHex: pubkeyHex,
      npub,
    });
  } catch {
    res.status(500).json({ error: "derivation_failed" });
  }
}

/** Test helper: clear pending challenges. */
export function _resetNostrChallengesForTesting(): void {
  challenges.clear();
}
