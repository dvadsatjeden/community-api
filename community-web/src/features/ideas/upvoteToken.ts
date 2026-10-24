const KEY = "d21.upvoteToken";
let sessionToken: string | undefined;
export function getOrCreateUpvoteToken(): string {
  if (sessionToken) return sessionToken;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return (sessionToken = existing);
  } catch { /* storage unavailable; retain identity for this session */ }
  sessionToken = crypto.randomUUID();
  try { localStorage.setItem(KEY, sessionToken); } catch { /* session token still works */ }
  return sessionToken;
}
