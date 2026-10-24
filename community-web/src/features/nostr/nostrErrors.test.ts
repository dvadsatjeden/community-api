import { describe, expect, it } from "vitest";
import { nostrAuthErrorToCode } from "./nostrErrors";

describe("remote signer errors", () => {
  it("always returns a printable string even when JSON.stringify returns undefined", () => {
    for (const value of [undefined, Symbol("failure"), () => {}, ""]) {
      expect(nostrAuthErrorToCode(value)).toBe("nostr_login_failed");
    }
  });
  it("handles cyclic errors and preserves useful signer messages", () => {
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    expect(nostrAuthErrorToCode(cyclic)).toBe("nostr_login_failed");
    expect(nostrAuthErrorToCode("signing rejected")).toBe("signing rejected");
    expect(nostrAuthErrorToCode(new Error("bunker closed"))).toBe("bunker closed");
  });
});
