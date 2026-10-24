import { describe, expect, it } from "vitest";
import { deriveFromMnemonic, generateMnemonic, validateBip39Mnemonic } from "./seedRecovery";
import { derivedAccountToPersisted, persistedToDerived } from "./accountStorage";
const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("account backup and recovery", () => {
  it("generates valid 12-word backups and rejects invalid checksums", () => {
    const generated = generateMnemonic();
    expect(generated.split(" ")).toHaveLength(12);
    expect(validateBip39Mnemonic(generated)).toBe(true);
    expect(validateBip39Mnemonic("abandon ".repeat(12))).toBe(false);
  });
  it("restores the same identity after whitespace/case normalization", () => {
    expect(deriveFromMnemonic(`  ${seed.toUpperCase().replaceAll(" ", "\n")}  `)).toEqual(deriveFromMnemonic(seed));
  });
  it("removes mnemonic only after backup confirmation without changing the access token", () => {
    const account = deriveFromMnemonic(seed);
    expect(derivedAccountToPersisted(account).mnemonic).toBe(seed);
    const persisted = derivedAccountToPersisted({ ...account, seedBackedUpConfirmed: true });
    expect(persisted.mnemonic).toBeUndefined();
    expect(persistedToDerived(persisted)?.rsvpToken).toBe(account.rsvpToken);
    expect(deriveFromMnemonic(seed).rsvpToken).toBe(account.rsvpToken);
  });
  it("rejects mismatched or malformed stored credentials", () => {
    const account = derivedAccountToPersisted(deriveFromMnemonic(seed));
    expect(persistedToDerived({ ...account, ownerId: "a".repeat(32) })).toBeNull();
    expect(persistedToDerived({ ...account, rsvpToken: "bad" })).toBeNull();
  });
});
