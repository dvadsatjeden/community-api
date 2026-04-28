import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Coords = [number, number]; // [lat, lng]
type Persisted = Record<string, Coords>;

let cache: Map<string, Coords> | null = null;
let queueProcessing = false;
const pendingQueue: string[] = [];

const cachePath = (): string =>
  process.env.GEOCODE_CACHE_PATH
    ? resolve(process.env.GEOCODE_CACHE_PATH)
    : resolve(process.cwd(), "data", "geocode-cache.json");

export const normalizeAddress = (addr: string): string => addr.trim().toLowerCase();

const load = (): void => {
  if (cache !== null) return;
  const p = cachePath();
  if (!existsSync(p)) { cache = new Map(); return; }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Persisted;
    cache = new Map(Object.entries(raw));
  } catch {
    cache = new Map();
  }
};

const persist = (): void => {
  if (!cache) return;
  const p = cachePath();
  mkdirSync(dirname(p), { recursive: true });
  const obj: Persisted = Object.fromEntries(cache);
  writeFileSync(p, JSON.stringify(obj, null, 0) + "\n", "utf8");
};

export const getCachedCoords = (address: string): Coords | undefined => {
  load();
  return cache!.get(normalizeAddress(address));
};

const fetchNominatim = async (address: string): Promise<Coords | null> => {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const r = await fetch(url, {
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
  const p = cachePath();
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
};
