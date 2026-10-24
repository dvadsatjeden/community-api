import { useCallback, useEffect, useRef, useState } from "react";
import type { DerivedAccount } from "../account/seedRecovery";
import type { RsvpCounts, RsvpStatus } from "./types";

type State = { token: string; items: Map<string, RsvpStatus> };
export function useRsvp(apiBase: string, account: DerivedAccount | null) {
  const token = account?.rsvpToken ?? "";
  const [state, setState] = useState<State>({ token: "", items: new Map() });
  const [countsByEvent, setCountsByEvent] = useState<Record<string, RsvpCounts>>({});
  const [rsvpError, setError] = useState<string | null>(null);
  const [pendingRsvp, setPending] = useState<Set<string>>(new Set());
  const activeToken = useRef(token);
  activeToken.current = token;
  const pending = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => {
    if (!apiBase) return;
    const abort = new AbortController();
    async function refresh() {
      const currentGeneration = generation.current;
      try {
        const counts = await fetch(`${apiBase}/v1/rsvp/counts`, { signal: abort.signal });
        if (!counts.ok) throw new Error("counts");
        const publicData = await counts.json() as { items: Record<string, RsvpCounts> };
        if (!abort.signal.aborted && currentGeneration === generation.current) setCountsByEvent(publicData.items);
        if (!token) return;
        const mine = await fetch(`${apiBase}/v1/rsvp/mine`, { headers: { "X-Anonymous-Token": token }, signal: abort.signal });
        if (!mine.ok) throw new Error("mine");
        const privateData = await mine.json() as { items: Record<string, RsvpStatus> };
        if (!abort.signal.aborted && activeToken.current === token && currentGeneration === generation.current) {
          setState({ token, items: new Map(Object.entries(privateData.items)) });
        }
      } catch {
        // Background refresh does not claim that unsent changes were saved.
      }
    }
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    window.addEventListener("focus", refresh);
    return () => { abort.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [apiBase, token]);

  const change = useCallback(async (eventId: string, status?: RsvpStatus) => {
    if (!token || !apiBase) return;
    const key = `${token}:${eventId}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setPending(new Set(pending.current));
    setError(null);
    generation.current++;
    try {
      const response = await fetch(`${apiBase}/v1/rsvp`, {
        method: status ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, anonymousToken: token, ...(status ? { status } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("save_failed");
      const result = await response.json() as { counts: RsvpCounts };
      if (activeToken.current !== token) return;
      setState(previous => {
        const items = new Map(previous.token === token ? previous.items : []);
        if (status) items.set(eventId, status); else items.delete(eventId);
        return { token, items };
      });
      setCountsByEvent(previous => ({ ...previous, [eventId]: result.counts }));
    } catch {
      if (activeToken.current === token) setError("Zmenu sa nepodarilo potvrdiť. Skontroluj pripojenie a skús znova.");
    } finally {
      generation.current++;
      pending.current.delete(key);
      setPending(new Set(pending.current));
    }
  }, [apiBase, token]);

  return {
    myRsvpByEvent: state.token === token ? state.items : new Map<string, RsvpStatus>(),
    countsByEvent, rsvpError,
    isRsvpPending: (eventId: string) => pendingRsvp.has(`${token}:${eventId}`),
    submitRsvp: (eventId: string, status: RsvpStatus) => change(eventId, status),
    removeRsvp: (eventId: string) => change(eventId),
  };
}
