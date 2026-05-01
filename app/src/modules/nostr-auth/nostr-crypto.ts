import { createHash, createHmac } from "node:crypto";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

/** SHA-256 UTF-8 string → 64 hex chars (same shape as community-web seedRecovery hash). */
export function sha256HexUtf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Deterministic credentials for a Nostr pubkey using server-only secret.
 * Must stay stable across deploys for the same NOSTR_AUTH_SECRET + pubkey.
 */
export function deriveNostrCredentials(
  secret: string,
  pubkeyHex: string
): { ownerId: string; rsvpToken: string; dataKey: string; mnemonic: string } {
  const pk = pubkeyHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(pk)) {
    throw new Error("Invalid pubkey hex");
  }
  const innerHex = createHmac("sha256", secret).update(`nostr:v1:${pk}`, "utf8").digest("hex");
  const ownerId = sha256HexUtf8(`owner:${innerHex}`).slice(0, 32);
  const rsvpToken = sha256HexUtf8(`rsvp:${innerHex}`);
  const dataKey = sha256HexUtf8(`key:${innerHex}`);
  const mnemonicEntropy = createHash("sha256").update(`evolu:${innerHex}`, "utf8").digest().subarray(0, 16);
  const mnemonic = entropyToMnemonic(mnemonicEntropy, wordlist);
  return { ownerId, rsvpToken, dataKey, mnemonic };
}
