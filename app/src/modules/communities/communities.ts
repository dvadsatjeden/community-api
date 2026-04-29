type Community = { name: string; url: string; lat: number; lng: number; marker_image?: string };

let cache: { items: Community[]; ts: number } | null = null;
const TTL = 30 * 60 * 1000;

const WP_URL = "https://www.dvadsatjeden.org/wp-json/dvadsatjeden/v1/communities";

export const getCommunities = async (): Promise<Community[]> => {
  if (cache && Date.now() - cache.ts < TTL) return cache.items;
  const r = await fetch(WP_URL);
  if (!r.ok) throw new Error(`WP communities ${r.status}`);
  const data = await r.json() as { items?: Community[] };
  const items = Array.isArray(data.items) ? data.items : [];
  cache = { items, ts: Date.now() };
  return items;
};

export const getCommunityUrl = async (id: number): Promise<string | null> => {
  const items = await getCommunities();
  return items[id]?.url ?? null;
};
