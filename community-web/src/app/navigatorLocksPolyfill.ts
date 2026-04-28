/**
 * Evolu (@evolu/web SharedWebWorker) volá `navigator.locks.request(...)`.
 * Web Locks nie sú na plain `http:` (okrem `localhost`); v tom prípade je `locks` `undefined`.
 * Doplníme zjednodušený `LockManager` (slabšia cross-tab exklúzia, ale appka nespadne).
 */
if (typeof globalThis !== "undefined" && typeof globalThis.navigator === "object" && globalThis.navigator) {
  const nav = globalThis.navigator;
  if (!nav.locks) {
    // Zjednodušené API (iba tvar, ktorý Evolu potrebuje)
    const lockManager = {
      request: <T>(name: string, arg2: unknown, arg3?: unknown) => {
        // request(name, cb) alebo request(name, options, cb)
        const callback = (typeof arg2 === "function" ? arg2 : (arg3 as (lock: Lock) => T | Promise<T>)) as (lock: Lock) => T | Promise<T>;
        return Promise.resolve(callback({} as Lock));
      },
      query: () => Promise.resolve({ held: [] as const, pending: [] as const }),
    } as LockManager;
    try {
      Object.defineProperty(nav, "locks", { value: lockManager, configurable: true, enumerable: true });
    } catch {
      (nav as unknown as { locks: LockManager }).locks = lockManager;
    }
  }
}
