import { beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// Use a temp file per test run so tests never touch production data.
process.env.RSVP_PERSIST_PATH = join(tmpdir(), `rsvp-test-${randomUUID()}.json`);

import { _resetCacheForTesting } from "./rsvp-persistence";
import { getMyRsvp, getRsvpCounts, removeRsvp, submitRsvp } from "./rsvp.controller";

beforeEach(() => {
  _resetCacheForTesting();
});

describe("getRsvpCounts", () => {
  it("returns zero counts for unknown event", () => {
    expect(getRsvpCounts("unknown")).toEqual({ going: 0, maybe: 0, not_going: 0 });
  });
});

describe("submitRsvp", () => {
  it("increments the correct bucket", () => {
    const counts = submitRsvp({ eventId: "e1", anonymousToken: "token-a", status: "going" });
    expect(counts).toEqual({ going: 1, maybe: 0, not_going: 0 });
  });

  it("two different tokens count separately", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "token-a", status: "going" });
    const counts = submitRsvp({ eventId: "e1", anonymousToken: "token-b", status: "maybe" });
    expect(counts).toEqual({ going: 1, maybe: 1, not_going: 0 });
  });

  it("same token updating status replaces (no double-count)", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "token-a", status: "going" });
    const counts = submitRsvp({ eventId: "e1", anonymousToken: "token-a", status: "maybe" });
    expect(counts).toEqual({ going: 0, maybe: 1, not_going: 0 });
  });

  it("tokens are hashed — same token produces same result regardless of call order", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "abc", status: "going" });
    submitRsvp({ eventId: "e1", anonymousToken: "abc", status: "going" });
    expect(getRsvpCounts("e1")).toEqual({ going: 1, maybe: 0, not_going: 0 });
  });

  it("votes for different events are independent", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "token-a", status: "going" });
    submitRsvp({ eventId: "e2", anonymousToken: "token-a", status: "maybe" });
    expect(getRsvpCounts("e1")).toEqual({ going: 1, maybe: 0, not_going: 0 });
    expect(getRsvpCounts("e2")).toEqual({ going: 0, maybe: 1, not_going: 0 });
  });
});

describe("removeRsvp", () => {
  it("decrements after removal", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "token-a", status: "going" });
    const counts = removeRsvp({ eventId: "e1", anonymousToken: "token-a" });
    expect(counts).toEqual({ going: 0, maybe: 0, not_going: 0 });
  });

  it("is a no-op for a token that never voted", () => {
    const counts = removeRsvp({ eventId: "e1", anonymousToken: "ghost" });
    expect(counts).toEqual({ going: 0, maybe: 0, not_going: 0 });
  });

  it("only removes the specified token, others remain", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "token-a", status: "going" });
    submitRsvp({ eventId: "e1", anonymousToken: "token-b", status: "going" });
    removeRsvp({ eventId: "e1", anonymousToken: "token-a" });
    expect(getRsvpCounts("e1")).toEqual({ going: 1, maybe: 0, not_going: 0 });
  });
});

describe("getMyRsvp", () => {
  it("returns empty object when token has no votes", () => {
    expect(getMyRsvp("no-votes")).toEqual({});
  });

  it("returns all events the token voted on", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "my-token", status: "going" });
    submitRsvp({ eventId: "e2", anonymousToken: "my-token", status: "maybe" });
    submitRsvp({ eventId: "e3", anonymousToken: "other-token", status: "going" });
    const mine = getMyRsvp("my-token");
    expect(Object.keys(mine)).toHaveLength(2);
    expect(mine["e1"]).toBe("going");
    expect(mine["e2"]).toBe("maybe");
  });

  it("does not return events after removal", () => {
    submitRsvp({ eventId: "e1", anonymousToken: "my-token", status: "going" });
    removeRsvp({ eventId: "e1", anonymousToken: "my-token" });
    expect(getMyRsvp("my-token")).toEqual({});
  });
});
