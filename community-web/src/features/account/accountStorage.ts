import { deriveFromMnemonic, validateBip39Mnemonic, type DerivedAccount } from "./seedRecovery";

/** JSON shape in localStorage + IndexedDB (môže obsahovať seed do potvrdenia zálohy). */
type PersistedAccount = {
  ownerId: string;
  rsvpToken: string;
  mnemonic?: string;
  seedBackedUpConfirmed?: boolean;
  authMethod?: "bip39" | "nostr";
  nostrPubkeyBech32?: string;
};

export function derivedAccountToPersisted(account: DerivedAccount): PersistedAccount {
  const hasMnemonic = account.mnemonic.trim().length > 0;
  const pending = hasMnemonic && account.seedBackedUpConfirmed !== true;
  const persist: PersistedAccount = {
    ownerId: account.ownerId,
    rsvpToken: account.rsvpToken,
  };
  if (pending) {
    persist.mnemonic = account.mnemonic.trim();
    persist.seedBackedUpConfirmed = false;
  } else {
    persist.seedBackedUpConfirmed = true;
  }
  if (account.authMethod) persist.authMethod = account.authMethod;
  if (account.nostrPubkeyBech32) persist.nostrPubkeyBech32 = account.nostrPubkeyBech32;
  return persist;
}

export function persistedToDerived(p: PersistedAccount): DerivedAccount | null {
  if (!p || typeof p.ownerId !== "string" || !/^[a-f0-9]{32}$/.test(p.ownerId) ||
      typeof p.rsvpToken !== "string" || !/^[a-f0-9]{64}$/.test(p.rsvpToken)) return null;
  const mnemonic = typeof p.mnemonic === "string" ? p.mnemonic.trim() : "";
  if (!p.seedBackedUpConfirmed && (!mnemonic || !validateBip39Mnemonic(mnemonic))) return null;
  if (mnemonic) {
    const derived = deriveFromMnemonic(mnemonic);
    if (derived.ownerId !== p.ownerId || derived.rsvpToken !== p.rsvpToken) return null;
  }
  return {
    ownerId: p.ownerId, rsvpToken: p.rsvpToken,
    mnemonic: p.seedBackedUpConfirmed ? "" : mnemonic,
    seedBackedUpConfirmed: p.seedBackedUpConfirmed === true,
    authMethod: p.authMethod === "nostr" ? "nostr" : "bip39",
    nostrPubkeyBech32: typeof p.nostrPubkeyBech32 === "string" ? p.nostrPubkeyBech32 : undefined,
  };
}

// ── IndexedDB backup (survives localStorage eviction) ──────────────────────
const IDB_NAME = "d21-storage-v2";
const IDB_STORE = "kv";

export function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAccount(): Promise<PersistedAccount | null> {
  try {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get("account");
      req.onsuccess = () => { db.close(); resolve((req.result as PersistedAccount) ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

export async function idbSetAccount(account: PersistedAccount | null): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(IDB_STORE, "readwrite");
      const store = transaction.objectStore(IDB_STORE);
      if (account) store.put(account, "account"); else store.delete("account");
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => { db.close(); resolve(); };
    });
  } catch { /* silent fail */ }
}
// ──────────────────────────────────────────────────────────────────────────

export function loadAccountFromStorage(): DerivedAccount | null {
  try {
    const raw = localStorage.getItem("d21.account.v2");
    if (!raw) return null;
    return persistedToDerived(JSON.parse(raw) as PersistedAccount);
  } catch {
    return null;
  }
}

/** Returns true if localStorage.setItem succeeded; false if it threw. IndexedDB is always updated with the same persist blob. */
export function saveAccountToStorage(account: DerivedAccount): boolean {
  const persist = derivedAccountToPersisted(account);
  let localStorageOk = true;
  try {
    localStorage.setItem("d21.account.v2", JSON.stringify(persist));
  } catch {
    localStorageOk = false;
    try {
      localStorage.removeItem("d21.account.v2");
    } catch {
      /* ignore — avoid leaving catch before finally if removeItem throws */
    }
  } finally {
    void idbSetAccount(persist);
  }
  return localStorageOk;
}
