import { useEffect, useState } from "react";
export type Community = { id: string; name: string; lat: number; lng: number; marker_image?: string };
export type SyncStatus = { lastSuccessAt: string | null; lastError: string | null; recordsImported: number };

export function useCommunities(apiBase: string) {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitySync, setSync] = useState<SyncStatus | null>(null);
  const [communityError, setError] = useState(false);
  useEffect(() => {
    if (!apiBase) return;
    const abort = new AbortController();
    let loading = false;
    async function refresh() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const response = await fetch(`${apiBase}/v1/communities`, { signal: abort.signal, cache: "no-store" });
        if (!response.ok) throw new Error("communities");
        const payload = await response.json() as { items: Community[]; sync: SyncStatus };
        if (abort.signal.aborted) return;
        setCommunities(payload.items);
        setSync(payload.sync);
        setError(false);
      } catch { if (!abort.signal.aborted) setError(true); }
      finally { loading = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      abort.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [apiBase]);
  return { communities, communitySync, communityError };
}
