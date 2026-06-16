const KEY = "d21.upvoteToken";

export const getOrCreateUpvoteToken = (): string => {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const newToken = crypto.randomUUID();
    localStorage.setItem(KEY, newToken);
    return newToken;
  } catch {
    return "fallback-" + Math.random().toString(36).slice(2);
  }
};
