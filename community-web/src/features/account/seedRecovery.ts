import { sha256 } from "@noble/hashes/sha256";
import { generateMnemonic as generateBip39Mnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export type AuthMethod = "bip39" | "nostr";

export type DerivedAccount = {
  mnemonic: string;
  ownerId: string;
  rsvpToken: string;
  dataKey: string;
  /** Persistované: false = seed ešte uložený na zariadení, používateľ musí potvrdiť zálohu. */
  seedBackedUpConfirmed?: boolean;
  /** `nostr` = identita z Nostr prihlásenia (owner/rsvp z API), BIP-39 slová pre Evolu z servera. */
  authMethod?: AuthMethod;
  /** Bech32 npub (zobrazenie / kontext zálohy). */
  nostrPubkeyBech32?: string;
};

const textEncoder = new TextEncoder();

const hash = (value: string): string => {
  const bytes = sha256(textEncoder.encode(value));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const generateMnemonic = (): string => {
  // BIP-39: 12 words = 128 bits entropy (plus checksum via library).
  return generateBip39Mnemonic(wordlist, 128);
};

const normalizeBip39Mnemonic = (mnemonic: string): string => {
  const words = mnemonic
    .trim()
    .toLowerCase()
    .split(/[\s\n\t]+/g)
    .filter((w) => w.length > 0);
  return words.join(" ");
};

export const validateBip39Mnemonic = (mnemonic: string): boolean => {
  return validateMnemonic(normalizeBip39Mnemonic(mnemonic), wordlist);
};

export const deriveFromMnemonic = (mnemonic: string): DerivedAccount => {
  if (!validateBip39Mnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic");
  }
  const normalized = normalizeBip39Mnemonic(mnemonic);
  return {
    mnemonic: normalized,
    ownerId: hash(`owner:${normalized}`).slice(0, 32),
    rsvpToken: hash(`rsvp:${normalized}`),
    dataKey: hash(`key:${normalized}`),
    seedBackedUpConfirmed: false,
  };
};
