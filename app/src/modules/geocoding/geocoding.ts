import { getDatabase, readSnapshot, writeSnapshot } from "../../storage/database.js";

type Coords = [number, number]; // [lat, lng]
type Persisted = Record<string, Coords>;

let cache: Map<string, Coords> | null = null;
let queueProcessing = false;
const pendingQueue: string[] = [];

export const normalizeAddress = (addr: string): string => addr.trim().toLowerCase();

const load = (): void => {
  if (cache !== null) return;
  cache = new Map(Object.entries(readSnapshot<Persisted>("geocoding") ?? {}));
};

const persist = (): void => {
  if (!cache) return;
  writeSnapshot("geocoding", Object.fromEntries(cache));
};

export const getCachedCoords = (address: string): Coords | undefined => {
  load();
  return cache!.get(normalizeAddress(address));
};

const fetchNominatim = async (address: string): Promise<Coords | null> => {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Accept-Language": "sk,cs,en",
      "User-Agent": "dvadsatjeden-community-api/1.0 (https://dvadsatjeden.org)",
    },
  });
  if (!r.ok) return null;
  const data = (await r.json()) as Array<{ lat: string; lon: string }>;
  return data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
};

const processQueue = async (): Promise<void> => {
  queueProcessing = true;
  while (pendingQueue.length > 0) {
    const key = pendingQueue.shift()!;
    load();
    if (cache!.has(key)) continue;
    try {
      const coords = await fetchNominatim(key);
      if (coords) { cache!.set(key, coords); persist(); }
    } catch { /* network error — will retry on next import */ }
    if (pendingQueue.length > 0) {
      await new Promise<void>((res) => setTimeout(res, 1200));
    }
  }
  queueProcessing = false;
};

export const scheduleGeocoding = (addresses: string[]): void => {
  load();
  for (const addr of addresses) {
    const key = normalizeAddress(addr);
    if (!cache!.has(key) && !pendingQueue.includes(key)) {
      pendingQueue.push(key);
    }
  }
  if (!queueProcessing && pendingQueue.length > 0) {
    void processQueue();
  }
};

export const _resetForTesting = (): void => {
  cache = null;
  pendingQueue.length = 0;
  queueProcessing = false;
  if (process.env.NODE_ENV !== "test") throw new Error("Test reset outside test environment");
  getDatabase().prepare("DELETE FROM snapshots WHERE name = 'geocoding'").run();
};
