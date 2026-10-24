let cache: { data: unknown; ts: number } | null = null;
const TTL = 30 * 60 * 1000;

const WP_POSTS_URL =
  "https://www.dvadsatjeden.org/wp-json/wp/v2/posts?per_page=5&_embed&_fields=id,date,link,title,_embedded,_links";

export const getArticles = async (): Promise<unknown> => {
  if (cache && Date.now() - cache.ts < TTL) return cache.data;
  const r = await fetch(process.env.ARTICLES_SOURCE_URL ?? WP_POSTS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`WP REST ${r.status}`);
  const data = await r.json();
  cache = { data, ts: Date.now() };
  return data;
};
