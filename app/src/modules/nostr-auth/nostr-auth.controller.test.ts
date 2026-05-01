import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { Request, Response } from "express";
import { deriveNostrCredentials } from "./nostr-crypto";
import {
  _resetNostrChallengesForTesting,
  NOSTR_AUTH_EVENT_KIND,
  nostrAuthChallengeGet,
  nostrAuthVerifyPost,
} from "./nostr-auth.controller";

const SECRET = "test-nostr-auth-secret-for-vitest-only";

type MockResponse = Response & { __body: unknown; statusCode: number };

function mockRes(): MockResponse {
  const res = {
    statusCode: 200,
    __body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.__body = payload;
      return this;
    },
  };
  return res as unknown as MockResponse;
}

describe("deriveNostrCredentials", () => {
  it("is deterministic for same secret and pubkey", () => {
    const pk = "a".repeat(64);
    const a = deriveNostrCredentials(SECRET, pk);
    const b = deriveNostrCredentials(SECRET, pk);
    expect(a).toEqual(b);
    expect(a.ownerId).toHaveLength(32);
    expect(a.rsvpToken).toHaveLength(64);
    expect(a.dataKey).toHaveLength(64);
    expect(a.mnemonic.split(/\s+/)).toHaveLength(12);
  });

  it("rejects invalid pubkey hex", () => {
    expect(() => deriveNostrCredentials(SECRET, "not-hex")).toThrow();
  });
});

describe("nostrAuthChallengeGet / nostrAuthVerifyPost", () => {
  beforeEach(() => {
    process.env.NOSTR_AUTH_SECRET = SECRET;
    _resetNostrChallengesForTesting();
  });

  afterEach(() => {
    delete process.env.NOSTR_AUTH_SECRET;
    _resetNostrChallengesForTesting();
  });

  it("returns credentials after valid signed auth event", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    const chRes = mockRes();
    nostrAuthChallengeGet({} as Request, chRes);
    expect(chRes.statusCode).toBe(200);
    const ch = chRes.__body as { challengeId: string; kind: number };
    expect(ch.challengeId).toHaveLength(32);
    expect(ch.kind).toBe(NOSTR_AUTH_EVENT_KIND);

    const event = finalizeEvent(
      {
        kind: NOSTR_AUTH_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["challenge", ch.challengeId]],
        content: "",
      },
      sk
    );

    const vRes = mockRes();
    nostrAuthVerifyPost({ body: { event } } as Request, vRes);
    expect(vRes.statusCode).toBe(200);
    const body = vRes.__body as {
      ownerId: string;
      rsvpToken: string;
      dataKey: string;
      mnemonic: string;
      nostrPubkeyHex: string;
    };
    expect(body.nostrPubkeyHex).toBe(pk);
    const expected = deriveNostrCredentials(SECRET, pk);
    expect(body.ownerId).toBe(expected.ownerId);
    expect(body.rsvpToken).toBe(expected.rsvpToken);
    expect(body.dataKey).toBe(expected.dataKey);
    expect(body.mnemonic).toBe(expected.mnemonic);
  });

  it("rejects reuse of same challenge", () => {
    const sk = generateSecretKey();
    const chRes = mockRes();
    nostrAuthChallengeGet({} as Request, chRes);
    const ch = chRes.__body as { challengeId: string };

    const event = finalizeEvent(
      {
        kind: NOSTR_AUTH_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["challenge", ch.challengeId]],
        content: "",
      },
      sk
    );

    const v1 = mockRes();
    nostrAuthVerifyPost({ body: { event } } as Request, v1);
    expect(v1.statusCode).toBe(200);

    const v2 = mockRes();
    nostrAuthVerifyPost({ body: { event } } as Request, v2);
    expect(v2.statusCode).toBe(400);
  });
});
