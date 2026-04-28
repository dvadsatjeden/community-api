import * as E from "@evolu/common";
import { useDvcEvolu } from "./evolu/dvcEvolu";
import { allDvcRsvp, clearDvcRsvp, upsertDvcRsvp } from "./evolu/dvcEvoluQueries";
import type { RsvpStatus } from "./evolu/rsvpStatus";
import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { type DerivedAccount, deriveFromMnemonic, generateMnemonic, validateBip39Mnemonic } from "../features/account/seedRecovery";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./community-app.css";
import { dateParts, TZ } from "./utils";

type EventItem = {
  id: string;
  title: string;
  startsAt: string;
  locationName?: string;
  country?: string;
  region?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  lat?: number;
  lng?: number;
};

type RsvpCounts = Record<RsvpStatus, number>;
type ViewName = "home" | "calendar" | "map" | "info";
const EVENT_CATEGORIES = ["MeetUpy", "Bitcoin Pivo", "Konferencie", "Ostatné"] as const;


const emptyCounts = (): RsvpCounts => ({ going: 0, maybe: 0, not_going: 0 });
const RSVP_LOCAL_KEY = "d21.localRsvpByEvent";
const DEFAULT_API_BASE_URL = "http://localhost:3021";
const statusPillLabel = (status: RsvpStatus | undefined): string | null => {
  if (status === "going") return "IDEM";
  if (status === "maybe") return "MOŽNO";
  return null;
};

const SeedTable = ({ mnemonic }: { mnemonic: string }): ReactElement => {
  const words = mnemonic.trim().split(/\s+/);
  return (
    <ol className="dvcSeedTable">
      {words.map((word, i) => (
        <li key={i} className="dvcSeedRow">
          <span className="dvcSeedNum">{i + 1}</span>
          <span className="dvcSeedWord">{word}</span>
        </li>
      ))}
    </ol>
  );
};

const ClockIcon = (): ReactElement => (
  <svg className="dvcClockIcon" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CalendarIcon = (): ReactElement => (
  <svg className="dvcCalendarIcon" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <rect x="1" y="2" width="10" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const MapPinIcon = (): ReactElement => (
  <svg className="dvcMapPinIcon" width="10" height="11" viewBox="0 0 10 12" fill="none" aria-hidden="true">
    <path d="M5 0.5A3.5 3.5 0 0 1 8.5 4c0 2.7-3.5 7-3.5 7S1.5 6.7 1.5 4A3.5 3.5 0 0 1 5 0.5z" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="5" cy="4" r="1.3" stroke="currentColor" strokeWidth="1.1"/>
  </svg>
);

const App = (): ReactElement => {
  const dvc = useDvcEvolu();
  const dvcRsvpQuery = useMemo(() => allDvcRsvp(dvc), [dvc]);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [configUrl, setConfigUrl] = useState(() => {
    const el = document.getElementById("dvadsatjeden-community-app");
    return el?.dataset.configUrl ?? "/wp-json/dvadsatjeden/v1/config";
  });
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filterCountry, setFilterCountry] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMine, setFilterMine] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [suggestedSeed] = useState(() => generateMnemonic());
  const [account, setAccount] = useState<DerivedAccount | null>(() => {
    const fromStorage = localStorage.getItem("d21.account");
    return fromStorage ? (JSON.parse(fromStorage) as DerivedAccount) : null;
  });
  const [evoluReady, setEvoluReady] = useState(false);
  const [evoluError, setEvoluError] = useState<string | null>(null);
  const [isEvoluConnecting, setIsEvoluConnecting] = useState(false);
  const [myRsvpByEvent, setMyRsvpByEvent] = useState<Map<string, RsvpStatus>>(() => new Map());
  const [localRsvpByEvent, setLocalRsvpByEvent] = useState<Map<string, RsvpStatus>>(() => new Map());
  const [clearedRsvpEventIds, setClearedRsvpEventIds] = useState<Set<string>>(() => new Set());
  const [countsByEvent, setCountsByEvent] = useState<Record<string, RsvpCounts>>({});
  const [rsvpSource, setRsvpSource] = useState<"evolu" | "server" | "local">("local");
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxImageAlt, setLightboxImageAlt] = useState<string>("");
  const [isSeedVisible, setIsSeedVisible] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  const [accountResetNotice, setAccountResetNotice] = useState<string | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(() => !localStorage.getItem("d21.account"));
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);
  const [view, setView] = useState<ViewName>("home");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const mapMarkersRef = useRef<L.Marker[]>([]);

  const loadLocalRsvpMap = useCallback((ownerId: string): Map<string, RsvpStatus> => {
    try {
      const raw = localStorage.getItem(RSVP_LOCAL_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw) as Record<string, Record<string, RsvpStatus>>;
      const byOwner = parsed[ownerId];
      if (!byOwner || typeof byOwner !== "object") return new Map();
      return new Map(Object.entries(byOwner));
    } catch {
      return new Map();
    }
  }, []);

  const saveLocalRsvpMap = useCallback((ownerId: string, map: Map<string, RsvpStatus>): void => {
    try {
      const raw = localStorage.getItem(RSVP_LOCAL_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, RsvpStatus>>) : {};
      parsed[ownerId] = Object.fromEntries(map);
      localStorage.setItem(RSVP_LOCAL_KEY, JSON.stringify(parsed));
    } catch {
      // ignore storage failures
    }
  }, []);

  const syncEvolu = useCallback(
    async (mnemonic: string) => {
      setIsEvoluConnecting(true);
      setEvoluError(null);
      const m = E.Mnemonic.from(mnemonic);
      if (!m.ok) {
        setEvoluReady(false);
        setIsEvoluConnecting(false);
        setEvoluError("Neplatný seed.");
        return;
      }
      try {
        const timeoutGuard = new Promise<"timeout">((resolve) => {
          window.setTimeout(() => resolve("timeout"), 12000);
        });

        const restore = dvc.restoreAppOwner(m.value, { reload: false }).then(() => "ok" as const);
        const result = await Promise.race([restore, timeoutGuard]);

        if (result === "timeout") {
          setEvoluReady(true);
          setEvoluError("Evolu sync sa doťahuje na pozadí…");
          setIsEvoluConnecting(false);
          void restore
            .then(() => {
              setEvoluReady(true);
              setEvoluError(null);
              setIsEvoluConnecting(false);
            })
            .catch((error) => {
              setEvoluReady(false);
              setEvoluError(error instanceof Error ? `Evolu chyba: ${error.message}` : "Evolu sa nepodarilo pripojiť.");
              setIsEvoluConnecting(false);
            });
          return;
        }

        setEvoluReady(true);
        setEvoluError(null);
      } catch (error) {
        setEvoluReady(false);
        setEvoluError(error instanceof Error ? `Evolu chyba: ${error.message}` : "Evolu sa nepodarilo pripojiť.");
      } finally {
        setIsEvoluConnecting(false);
      }
    },
    [dvc]
  );

  useEffect(() => {
    if (!account) {
      setEvoluReady(false);
      setIsSeedVisible(false);
      setEvoluError(null);
      setIsEvoluConnecting(false);
      setLocalRsvpByEvent(new Map());
      setClearedRsvpEventIds(new Set());
      setRsvpSource("local");
      return;
    }
    setLocalRsvpByEvent(loadLocalRsvpMap(account.ownerId));
    void syncEvolu(account.mnemonic);
  }, [account, syncEvolu, loadLocalRsvpMap]);

  useEffect(() => {
    if (!evoluReady || !account) {
      setMyRsvpByEvent(new Map());
      return;
    }
    const run = (rows: ReadonlyArray<{ eventId: unknown; status: unknown }>): void => {
      const m = new Map<string, RsvpStatus>();
      for (const r of rows) {
        m.set(String(r.eventId), r.status as RsvpStatus);
      }
      setMyRsvpByEvent(m);
      setRsvpSource("evolu");
      setClearedRsvpEventIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const eventId of prev) {
          if (!m.has(eventId)) next.delete(eventId);
        }
        return next;
      });
    };
    const unsub = dvc.subscribeQuery(dvcRsvpQuery)(() => {
      run(dvc.getQueryRows(dvcRsvpQuery));
    });
    void dvc.loadQuery(dvcRsvpQuery).then((rows) => run(rows));
    return unsub;
  }, [dvc, dvcRsvpQuery, evoluReady, account]);

  useEffect(() => {
    if (!account) return;
    if (myRsvpByEvent.size === 0) return;
    saveLocalRsvpMap(account.ownerId, myRsvpByEvent);
    setLocalRsvpByEvent((prev) => (prev.size > 0 ? prev : new Map(myRsvpByEvent)));
  }, [account, myRsvpByEvent, saveLocalRsvpMap]);

  useEffect(() => {
    const mount = document.getElementById("dvadsatjeden-community-app");
    if (mount?.dataset.configUrl) setConfigUrl(mount.dataset.configUrl);
  }, []);

  useEffect(() => {
    if (!configUrl) return;
    void fetch(configUrl)
      .then((r) => r.json())
      .then((cfg) => {
        if (typeof cfg.apiBaseUrl === "string" && cfg.apiBaseUrl.length > 0) {
          setApiBaseUrl(cfg.apiBaseUrl);
          return;
        }
        const mount = document.getElementById("dvadsatjeden-community-app");
        if (!cfg.apiBaseUrl && mount?.dataset.apiBaseUrl) {
          setApiBaseUrl(mount.dataset.apiBaseUrl);
          return;
        }
        setApiBaseUrl(DEFAULT_API_BASE_URL);
      })
      .catch(() => setApiBaseUrl(DEFAULT_API_BASE_URL));
  }, [configUrl]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    const params = new URLSearchParams({ future: "1", sort: "asc" });
    void fetch(`${apiBaseUrl}/v1/events?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setEvents((data.items ?? []) as EventItem[]));
  }, [apiBaseUrl]);

  const refetchAllPublicCounts = useCallback(async () => {
    if (!apiBaseUrl || events.length === 0) return;
    const next: Record<string, RsvpCounts> = {};
    await Promise.all(
      events.map(async (e) => {
        try {
          const r = await fetch(`${apiBaseUrl}/v1/rsvp/${encodeURIComponent(e.id)}/counts`);
          if (!r.ok) return;
          const j = (await r.json()) as { counts?: RsvpCounts };
          if (j.counts) next[e.id] = j.counts;
        } catch {
          // ignore
        }
      })
    );
    setCountsByEvent(next);
  }, [apiBaseUrl, events]);

  const filterOptions = useMemo(() => {
    const countries = Array.from(new Set(events.map((e) => (e.country ?? "").trim()).filter((v) => v.length > 0))).sort((a, b) => a.localeCompare(b, "sk"));
    const regions = Array.from(new Set(events.map((e) => (e.region ?? "").trim()).filter((v) => v.length > 0))).sort((a, b) => a.localeCompare(b, "sk"));
    const categories = EVENT_CATEGORIES.filter((label) => events.some((e) => (e.category ?? "").trim() === label));
    return { countries, regions, categories };
  }, [events]);

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => {
        if (filterCountry !== "all" && (e.country ?? "") !== filterCountry) return false;
        if (filterRegion !== "all" && (e.region ?? "") !== filterRegion) return false;
        if (filterCategory !== "all" && (e.category ?? "") !== filterCategory) return false;
        if (filterMine) {
          const mine = clearedRsvpEventIds.has(e.id) ? undefined : (localRsvpByEvent.get(e.id) ?? myRsvpByEvent.get(e.id));
          if (!mine || mine === "not_going") return false;
        }
        return true;
      }),
    [events, filterCountry, filterRegion, filterCategory, filterMine, localRsvpByEvent, myRsvpByEvent, clearedRsvpEventIds]
  );

  useEffect(() => {
    if (!apiBaseUrl || events.length === 0) return;
    void refetchAllPublicCounts();
  }, [apiBaseUrl, events, refetchAllPublicCounts]);

  useEffect(() => {
    if (!apiBaseUrl || !account) return;
    void fetch(`${apiBaseUrl}/v1/rsvp/mine`, {
      headers: { "X-Anonymous-Token": account.rsvpToken },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { items?: Record<string, RsvpStatus> } | null) => {
        if (!payload?.items || typeof payload.items !== "object") return;
        const fromServer = new Map<string, RsvpStatus>();
        for (const [eventId, status] of Object.entries(payload.items)) {
          if (status === "going" || status === "maybe" || status === "not_going") {
            fromServer.set(eventId, status);
          }
        }
        if (fromServer.size === 0) return;
        setLocalRsvpByEvent(fromServer);
        setMyRsvpByEvent(fromServer);
        setRsvpSource("server");
        saveLocalRsvpMap(account.ownerId, fromServer);
      })
      .catch(() => {});
  }, [apiBaseUrl, account, saveLocalRsvpMap]);

  // Close lightbox, detail modal or account modal on Escape
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (lightboxImageUrl) { setLightboxImageUrl(null); return; }
      if (detailEvent) { setDetailEvent(null); return; }
      if (isAccountModalOpen) setIsAccountModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxImageUrl, detailEvent, isAccountModalOpen]);

  const createAccount = (): void => {
    const next = deriveFromMnemonic(suggestedSeed);
    setAccount(next);
    localStorage.setItem("d21.account", JSON.stringify(next));
    setIsAccountModalOpen(false);
  };

  const restoreAccount = (): void => {
    if (!validateBip39Mnemonic(mnemonicInput)) {
      setMnemonicError("Neplatný seed — skontroluj poradie a pravopis 12 slov.");
      return;
    }
    setMnemonicError(null);
    const restored = deriveFromMnemonic(mnemonicInput);
    setAccount(restored);
    localStorage.setItem("d21.account", JSON.stringify(restored));
    setIsAccountModalOpen(false);
  };

  const resetAccountOnDevice = (): void => {
    localStorage.removeItem("d21.account");
    setAccount(null);
    setMnemonicInput("");
    setMyRsvpByEvent(new Map());
    setLocalRsvpByEvent(new Map());
    setClearedRsvpEventIds(new Set());
    setCountsByEvent({});
    setEvoluReady(false);
    setEvoluError(null);
    setIsEvoluConnecting(false);
    setIsSeedVisible(false);
    setSeedCopied(false);
    setIsAccountModalOpen(false);
    setAccountResetNotice("Účet na tomto zariadení bol vymazaný.");
    window.setTimeout(() => setAccountResetNotice(null), 2500);

    void Promise.race([
      dvc.resetAppOwner({ reload: false }),
      new Promise((resolve) => window.setTimeout(resolve, 4000)),
    ]).catch(() => {});
  };

  const submitRsvp = async (eventId: string, status: RsvpStatus): Promise<void> => {
    if (!account || !apiBaseUrl || !evoluReady) return;
    setLocalRsvpByEvent((prev) => {
      const next = new Map(prev);
      next.set(eventId, status);
      if (account) saveLocalRsvpMap(account.ownerId, next);
      return next;
    });
    setClearedRsvpEventIds((prev) => {
      if (!prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    const u = upsertDvcRsvp(dvc, eventId, status);
    if (!u.ok) {
      setLocalRsvpByEvent((prev) => {
        const next = new Map(prev);
        next.delete(eventId);
        if (account) saveLocalRsvpMap(account.ownerId, next);
        return next;
      });
      return;
    }
    const res = await fetch(`${apiBaseUrl}/v1/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, anonymousToken: account.rsvpToken, status }),
    });
    if (res.ok) await refetchAllPublicCounts();
  };

  const removeRsvp = async (eventId: string): Promise<void> => {
    if (!account || !apiBaseUrl || !evoluReady) return;
    setLocalRsvpByEvent((prev) => {
      const next = new Map(prev);
      next.delete(eventId);
      if (account) saveLocalRsvpMap(account.ownerId, next);
      return next;
    });
    setClearedRsvpEventIds((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
    const cleared = clearDvcRsvp(dvc, eventId);
    if (!cleared.ok) {
      setLocalRsvpByEvent((prev) => {
        const next = new Map(prev);
        next.set(eventId, "going");
        if (account) saveLocalRsvpMap(account.ownerId, next);
        return next;
      });
      setClearedRsvpEventIds((prev) => {
        if (!prev.has(eventId)) return prev;
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      return;
    }
    const res = await fetch(`${apiBaseUrl}/v1/rsvp`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, anonymousToken: account.rsvpToken }),
    });
    if (res.ok) await refetchAllPublicCounts();
  };

  const shareEvent = async (ev: EventItem): Promise<void> => {
    const url = ev.sourceUrl ?? window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: ev.title, url }); } catch { /* user cancelled */ }
    } else {
      try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
    }
  };

  const toCalendarUrl = (ev: EventItem): string => {
    const start = new Date(ev.startsAt);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: ev.title,
      dates: `${fmt(start)}/${fmt(end)}`,
    });
    if (ev.locationName) params.set("location", ev.locationName);
    if (ev.description) params.set("details", ev.description);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // Init Leaflet + update markers (coords come from API, no client-side geocoding)
  useEffect(() => {
    if (view !== "map" || !mapContainerRef.current) return;
    if (!leafletMapRef.current) {
      const map = L.map(mapContainerRef.current, { center: [48.7, 19.5], zoom: 7 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      leafletMapRef.current = map;
    } else {
      leafletMapRef.current.invalidateSize();
    }
    const map = leafletMapRef.current;
    mapMarkersRef.current.forEach((m) => m.remove());
    mapMarkersRef.current = [];
    for (const ev of events) {
      if (ev.lat == null || ev.lng == null) continue;
      const icon = L.divIcon({
        className: "",
        html: `<div class="dvcMapMarker" title="${ev.title.replace(/"/g, "")}"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([ev.lat, ev.lng], { icon });
      marker.bindTooltip(ev.title, { direction: "top", offset: [0, -10] });
      marker.on("click", () => setDetailEvent(ev));
      marker.addTo(map);
      mapMarkersRef.current.push(marker);
    }
  }, [view, events]);

  const copySeed = async (): Promise<void> => {
    if (!account) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(account.mnemonic);
      } else {
        const ta = document.createElement("textarea");
        ta.value = account.mnemonic;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 1600);
    } catch {
      setSeedCopied(false);
    }
  };

  const calendarGroups = useMemo(() => {
    const map = new Map<string, { label: string; evs: EventItem[] }>();
    for (const ev of events) {
      const d = new Date(ev.startsAt);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { label: d.toLocaleString("sk-SK", { month: "long", year: "numeric", timeZone: TZ }), evs: [] });
      map.get(key)!.evs.push(ev);
    }
    return Array.from(map.values());
  }, [events]);

  return (
    <div className="dvc">
      <div className="dvcShell">
        {view === "home" ? (<>
        <header className="dvcHero">
          <div className="dvcHeroTop">
            <h1 className="dvcTitle">Komunitná appka</h1>
            <button
              className={`dvcBtn ${account ? "dvcBtnGhost" : "dvcBtnPrimary"} dvcAccountBtn`}
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
            >
              {account ? "Môj účet" : "Vytvor účet"}
            </button>
          </div>
          <p className="dvcSub dvcSub--hero">
            Nadchádzajúce Bitcoin eventy na Slovensku a v Česku. RSVP funguje anonymne — účet je len seed uložený u teba v prehliadači.
          </p>
        </header>

        <div className="dvcGrid dvcGrid--spaced">
          <div className="dvcCard dvcCard--wide dvcCard--events">
            <h2 className="dvcCardTitle">Budúce udalosti</h2>
            <p className="dvcCardSubtitle">Nadchádzajúce meetupy, konferencie a stretnutia Bitcoinerov. Pridaj sa!</p>
            <div className="dvcFilters">
              <label className="dvcFilterItem">
                <span>Krajina</span>
                <select className="dvcInput" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
                  <option value="all">Všetky</option>
                  {filterOptions.countries.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="dvcFilterItem">
                <span>Región</span>
                <select className="dvcInput" value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
                  <option value="all">Všetky</option>
                  {filterOptions.regions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="dvcFilterItem">
                <span>Typ eventu</span>
                <select className="dvcInput" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="all">Všetky</option>
                  {filterOptions.categories.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              {account ? (
                <button
                  className={filterMine ? "dvcFilterChip dvcFilterChip--active" : "dvcFilterChip"}
                  type="button"
                  onClick={() => setFilterMine((v) => !v)}
                >
                  Moje
                </button>
              ) : null}
            </div>
            {!apiBaseUrl ? (
              <div className="dvcEmpty">Nemám <code>apiBaseUrl</code> — neviem načítať udalosti.</div>
            ) : null}
            {apiBaseUrl && events.length === 0 ? <div className="dvcEmpty">Žiadne budúce udalosti (alebo sa ešte načítavajú).</div> : null}
            {apiBaseUrl && events.length > 0 && filteredEvents.length === 0 ? <div className="dvcEmpty">Pre zvolené filtre nie sú žiadne udalosti.</div> : null}

            <div className="dvcEventList">
              {filteredEvents.map((event) => {
                const parts = dateParts(event.startsAt);
                const counts = countsByEvent[event.id] ?? emptyCounts();
                const mine = clearedRsvpEventIds.has(event.id) ? undefined : (localRsvpByEvent.get(event.id) ?? myRsvpByEvent.get(event.id));
                return (
                  <article className="dvcEvent" key={event.id}>
                    {event.category ? <span className="dvcEventCategory">{event.category}</span> : null}
                    <div className="dvcEventDateCol">
                      <div className="dvcEventDate" aria-label="Dátum udalosti">
                        <div className="dvcEventDow">{parts.dow}</div>
                        <div className="dvcEventDay">{parts.day}</div>
                        <div className="dvcEventMonth">{parts.month}</div>
                        <div className="dvcEventTime"><ClockIcon />{parts.time}</div>
                      </div>
                      {mine === "going" ? <span className="dvcEventDateState dvcEventDateState--going">IDEM</span> : null}
                      {mine === "maybe" ? <span className="dvcEventDateState dvcEventDateState--maybe">MOŽNO</span> : null}
                    </div>

                    <div className="dvcEventBody">
                      <div className="dvcEventTitleRow">
                        <h3 className="dvcEventTitle">
                          <button className="dvcEventTitleBtn" type="button" onClick={() => setDetailEvent(event)}>
                            {event.title}
                          </button>
                        </h3>
                      </div>
                      <p className="dvcEventMeta">
                        <span className="dvcEventMetaLine dvcEventMetaLine--location">
                          <MapPinIcon />
                          {event.locationName ? (
                            <a
                              className="dvcEventLocationLink"
                              href={`https://maps.google.com/maps?q=${encodeURIComponent(event.locationName)}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {event.locationName}
                            </a>
                          ) : "Miesto bude doplnené"}
                        </span>
                        {event.description ? <span className="dvcEventMetaLine dvcEventMetaLine--desc">{event.description}</span> : null}
                      </p>
                      <div className="dvcEventCounts">
                        <span className={counts.going > 0 ? "dvcEventCount dvcEventCount--going" : "dvcEventCount dvcEventCount--zero"}>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{marginRight: "3px", verticalAlign: "middle"}}><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          {counts.going} idem
                        </span>
                        <span className="dvcEventCountDot">·</span>
                        <span className={counts.maybe > 0 ? "dvcEventCount dvcEventCount--maybe" : "dvcEventCount dvcEventCount--zero"}>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{marginRight: "3px", verticalAlign: "middle"}}><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4.8a1.5 1.5 0 0 1 2.8.7c0 .9-.9 1.2-1.3 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="8.5" r="0.55" fill="currentColor"/></svg>
                          {counts.maybe} možno
                        </span>
                      </div>
                    </div>
                    <div className="dvcRsvpRow">
                      <button
                        className={mine === "going" ? "dvcBtn dvcBtnPrimary dvcBtn--rsvp dvcBtn--active dvcBtn--joined" : "dvcBtn dvcBtn--rsvp dvcBtn--rsvpDark"}
                        type="button"
                        onClick={() => void submitRsvp(event.id, "going")}
                        disabled={!account || mine === "going"}
                        aria-label={`Zúčastním sa, aktuálne ${counts.going}`}
                      >
                        Zúčastním sa
                      </button>
                      <button
                        className={mine === "maybe" ? "dvcBtn dvcBtn--rsvp dvcBtn--active" : "dvcBtn dvcBtn--rsvp dvcBtn--rsvpDark"}
                        type="button"
                        onClick={() => void submitRsvp(event.id, "maybe")}
                        disabled={!account}
                      >
                        Možno
                      </button>
                      {mine ? (
                        <button className="dvcBtn dvcBtn--rsvp dvcBtn--rsvpDark" type="button" onClick={() => void removeRsvp(event.id)} disabled={!account}>
                          Zrušiť
                        </button>
                      ) : null}
                      {!account ? (
                        <button className="dvcPill dvcPill--rsvp dvcPillBtn" type="button" onClick={() => setIsAccountModalOpen(true)}>
                          Najprv vytvor účet
                        </button>
                      ) : null}
                      {account && !evoluReady ? <span className="dvcPill dvcPill--wait">Evolu nedostupné</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
        </>) : null}

        {/* ── Calendar view ── */}
        {view === "calendar" ? (
          <div className="dvcCalView">
            <header className="dvcViewHeader">
              <h2 className="dvcViewTitle">Kalendár eventov</h2>
            </header>
            {calendarGroups.length === 0 ? <div className="dvcEmpty">Žiadne udalosti.</div> : null}
            {calendarGroups.map(({ label, evs }) => (
              <div key={label} className="dvcCalMonth">
                <h3 className="dvcCalMonthTitle">{label}</h3>
                {evs.map((ev) => {
                  const parts = dateParts(ev.startsAt);
                  const mine = clearedRsvpEventIds.has(ev.id) ? undefined : (localRsvpByEvent.get(ev.id) ?? myRsvpByEvent.get(ev.id));
                  return (
                    <button key={ev.id} className="dvcCalItem" type="button" onClick={() => setDetailEvent(ev)}>
                      <div className="dvcCalItemDate">
                        <span className="dvcCalDay">{parts.day}</span>
                        <span className="dvcCalDow">{parts.dow}</span>
                        <span className="dvcCalTime">{parts.time}</span>
                      </div>
                      <div className="dvcCalItemBody">
                        <span className="dvcCalTitle">{ev.title}</span>
                        {ev.locationName ? <span className="dvcCalLocation"><MapPinIcon />{ev.locationName}</span> : null}
                      </div>
                      {mine ? <span className={`dvcEventDateState dvcEventDateState--${mine}`}>{mine === "going" ? "IDEM" : "MOŽNO"}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Map view — always in DOM so Leaflet persists ── */}
        <div className="dvcMapViewWrapper" style={{ display: view === "map" ? "flex" : "none" }}>
          <p className="dvcMapHint">Geokódovanie adries… Klikni na marker pre detail.</p>
          <div ref={mapContainerRef} className="dvcMapContainer" />
        </div>

        {/* ── Info view ── */}
        {view === "info" ? (
          <div className="dvcInfoView">
            <div className="dvcCard dvcCard--accent">
              <h2 className="dvcCardTitle">O aplikácii</h2>
              <p className="dvcMuted" style={{ marginBottom: "10px" }}>Komunitná aplikácia pre Bitcoinerov na Slovensku a v Česku. Sleduj eventy, pridaj sa anonymne cez BIP-39 seed.</p>
              <p className="dvcMuted">
                Verzia {__APP_VERSION__} ·{" "}
                <a href="https://dvadsatjeden.org" target="_blank" rel="noreferrer">dvadsatjeden.org</a>
              </p>
            </div>
          </div>
        ) : null}

        {lightboxImageUrl ? (
          <div className="dvcLightbox" role="dialog" aria-modal="true" aria-label="Náhľad obrázka" onClick={() => setLightboxImageUrl(null)}>
            <button className="dvcLightboxClose" type="button" onClick={() => setLightboxImageUrl(null)} aria-label="Zatvoriť náhľad">×</button>
            <img
              className="dvcLightboxImage"
              src={lightboxImageUrl}
              alt={lightboxImageAlt}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ) : null}

        {detailEvent ? (() => {
          const detailMine = clearedRsvpEventIds.has(detailEvent.id) ? undefined : (localRsvpByEvent.get(detailEvent.id) ?? myRsvpByEvent.get(detailEvent.id));
          const detailCounts = countsByEvent[detailEvent.id] ?? emptyCounts();
          return (
            <div className="dvcModal" role="dialog" aria-modal="true" aria-label={detailEvent.title} onClick={() => setDetailEvent(null)}>
              <div className="dvcModalPanel dvcEventModalPanel" onClick={(e) => e.stopPropagation()}>
                <button className="dvcModalClose" type="button" onClick={() => setDetailEvent(null)} aria-label="Zatvoriť">×</button>

                {detailEvent.imageUrl ? (
                  <div className="dvcEventModalImage">
                    <button type="button" className="dvcEventModalImageBtn" onClick={() => { setLightboxImageUrl(detailEvent.imageUrl ?? null); setLightboxImageAlt(detailEvent.title); }} aria-label="Zobraziť v plnej veľkosti">
                      <img src={detailEvent.imageUrl} alt={detailEvent.title} />
                    </button>
                  </div>
                ) : null}

                <div className="dvcEventModalBody">
                  {detailEvent.category ? <span className="dvcEventCategory dvcEventCategory--modal">{detailEvent.category}</span> : null}
                  <h2 className="dvcModalTitle" style={{ marginTop: "8px" }}>{detailEvent.title}</h2>
                  <div className="dvcEventModalMeta">
                    <span className="dvcEventModalMetaRow">
                      <CalendarIcon />
                      {new Date(detailEvent.startsAt).toLocaleString("sk-SK", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ })}
                    </span>
                    <span className="dvcEventModalMetaRow">
                      <ClockIcon />
                      {new Date(detailEvent.startsAt).toLocaleString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}
                    </span>
                    {detailEvent.locationName ? (
                      <span className="dvcEventModalMetaRow">
                        <MapPinIcon />
                        <a
                          className="dvcEventLocationLink"
                          href={`https://maps.google.com/maps?q=${encodeURIComponent(detailEvent.locationName)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {detailEvent.locationName}
                        </a>
                      </span>
                    ) : null}
                    {detailEvent.country || detailEvent.region ? <span className="dvcEventModalMetaRow">{[detailEvent.region, detailEvent.country].filter(Boolean).join(", ")}</span> : null}
                  </div>

                  {detailEvent.description ? (
                    <p className="dvcEventModalDesc">{detailEvent.description}</p>
                  ) : null}

                  <div className="dvcEventModalRsvp">
                    <div className="dvcEventCounts">
                      <span className={detailCounts.going > 0 ? "dvcEventCount dvcEventCount--going" : "dvcEventCount dvcEventCount--zero"}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{marginRight:"3px",verticalAlign:"middle"}}><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        {detailCounts.going} idem
                      </span>
                      <span className="dvcEventCountDot">·</span>
                      <span className={detailCounts.maybe > 0 ? "dvcEventCount dvcEventCount--maybe" : "dvcEventCount dvcEventCount--zero"}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{marginRight:"3px",verticalAlign:"middle"}}><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4.8a1.5 1.5 0 0 1 2.8.7c0 .9-.9 1.2-1.3 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="8.5" r="0.55" fill="currentColor"/></svg>
                        {detailCounts.maybe} možno
                      </span>
                    </div>
                    <div className="dvcRsvpRow">
                      <button className={detailMine === "going" ? "dvcBtn dvcBtnPrimary dvcBtn--rsvp dvcBtn--active dvcBtn--joined" : "dvcBtn dvcBtn--rsvp dvcBtn--rsvpDark"} type="button" onClick={() => void submitRsvp(detailEvent.id, "going")} disabled={!account || detailMine === "going"}>Zúčastním sa</button>
                      <button className={detailMine === "maybe" ? "dvcBtn dvcBtn--rsvp dvcBtn--active" : "dvcBtn dvcBtn--rsvp dvcBtn--rsvpDark"} type="button" onClick={() => void submitRsvp(detailEvent.id, "maybe")} disabled={!account}>Možno</button>
                      {detailMine ? <button className="dvcBtn dvcBtn--rsvp dvcBtn--rsvpDark" type="button" onClick={() => void removeRsvp(detailEvent.id)} disabled={!account}>Zrušiť</button> : null}
                      {!account ? <button className="dvcPill dvcPill--rsvp dvcPillBtn" type="button" onClick={() => { setDetailEvent(null); setIsAccountModalOpen(true); }}>Najprv vytvor účet</button> : null}
                    </div>
                  </div>

                  <div className="dvcEventModalActions">
                    {detailEvent.sourceUrl ? (
                      <a className="dvcBtn dvcBtnPrimary" href={detailEvent.sourceUrl} target="_blank" rel="noreferrer">
                        Detail
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{marginLeft:"6px",verticalAlign:"middle"}}><path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M8 1h3v3M11 1 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </a>
                    ) : null}
                    <a className="dvcBtn dvcBtnGhost" href={toCalendarUrl(detailEvent)} target="_blank" rel="noreferrer">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{marginRight:"5px",verticalAlign:"middle"}}><rect x="1" y="2.5" width="12" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1v3M10 1v3M1 6h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      Pridať do kalendára
                    </a>
                    <button className="dvcBtn dvcBtnGhost" type="button" onClick={() => void shareEvent(detailEvent)}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{marginRight:"5px",verticalAlign:"middle"}}><circle cx="11" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="11.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="3" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.3 6.2l5.4-3M4.3 7.8l5.4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      Zdieľať
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })() : null}

        {isAccountModalOpen ? (
          <div className="dvcModal" role="dialog" aria-modal="true" aria-label="Správa účtu" onClick={() => setIsAccountModalOpen(false)}>
            <div className="dvcModalPanel" onClick={(e) => e.stopPropagation()}>
              <button className="dvcModalClose" type="button" onClick={() => setIsAccountModalOpen(false)} aria-label="Zatvoriť">×</button>

              {!account ? (
                <>
                  <h2 className="dvcModalTitle">Vytvor alebo obnov účet</h2>
                  <p className="dvcMuted dvcMuted--sm" style={{ marginBottom: "20px" }}>
                    Účet je 12-slovný seed uložený iba v tvojom prehliadači. Seed sa nikdy neposiela na server.
                  </p>

                  <div className="dvcFieldRow">
                    <div>
                      <div className="dvcLabel">Navrhovaný seed — ulož si ho skôr, ako vytvoríš účet</div>
                      <SeedTable mnemonic={suggestedSeed} />
                    </div>
                    <div className="dvcRow">
                      <button className="dvcBtn dvcBtnPrimary" type="button" onClick={createAccount} disabled={!suggestedSeed}>
                        Vytvoriť anonymný účet
                      </button>
                    </div>

                    <hr className="dvcDivider" />

                    <div>
                      <div className="dvcLabel">Obnoviť účet — vlož 12 slov v správnom poradí</div>
                      <textarea
                        className="dvcTextarea"
                        value={mnemonicInput}
                        onChange={(e) => { setMnemonicInput(e.target.value); setMnemonicError(null); }}
                        placeholder="napr. word1 word2 ... word12"
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                      />
                      {mnemonicError ? <p className="dvcFieldError">{mnemonicError}</p> : null}
                    </div>
                    <div className="dvcRow">
                      <button className="dvcBtn dvcBtnGhost" type="button" onClick={restoreAccount}>
                        Obnoviť účet
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="dvcModalTitle">Môj účet</h2>

                  <div className="dvcPillGroup">
                    <span className="dvcPill dvcPill--ok">Účet je vytvorený</span>
                    {evoluReady ? <span className="dvcPill dvcPill--ok">Evolu: pripravené</span> : null}
                    {!evoluReady && isEvoluConnecting ? <span className="dvcPill dvcPill--wait">Evolu: pripájam…</span> : null}
                    {!evoluReady && !isEvoluConnecting ? <span className="dvcPill dvcPill--wait">Evolu: odpojené</span> : null}
                  </div>

                  <div className="dvcFieldRow dvcFieldRow--tight">
                    <div>
                      <div className="dvcLabel">Owner ID (verejné)</div>
                      <code className="dvcCodeInline">{account.ownerId}</code>
                    </div>

                    <div>
                      <div className="dvcLabel">Seed (12 slov — nikomu neposielaj)</div>
                      <div className="dvcRow" style={{ marginBottom: "10px" }}>
                        <button className="dvcBtn dvcBtnGhost" type="button" onClick={() => setIsSeedVisible((v) => !v)}>
                          {isSeedVisible ? "Skryť seed" : "Zobraziť seed"}
                        </button>
                        {isSeedVisible ? (
                          <button className="dvcBtn" type="button" onClick={() => void copySeed()}>
                            Kopírovať seed
                          </button>
                        ) : null}
                        {seedCopied ? <span className="dvcPill dvcPill--ok">Skopírované</span> : null}
                      </div>
                      {isSeedVisible ? (
                        <div className="dvcSeedBlock">
                          <SeedTable mnemonic={account.mnemonic} />
                        </div>
                      ) : null}
                    </div>

                    {evoluError ? (
                      <div className="dvcRow">
                        <span className="dvcPill dvcPill--wait">{evoluError}</span>
                        <button className="dvcBtn" type="button" onClick={() => void syncEvolu(account.mnemonic)}>
                          Skúsiť znova
                        </button>
                      </div>
                    ) : null}

                    <hr className="dvcDivider" />

                    <div className="dvcRow">
                      <button className="dvcBtn" type="button" onClick={resetAccountOnDevice}>
                        Vymazať účet na tomto zariadení
                      </button>
                    </div>
                    <p className="dvcMuted dvcMuted--sm">
                      Rovnaký seed na inom zariadení obnoví tvoj účet aj RSVP históriu.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {accountResetNotice ? (
          <div className="dvcToast">
            <span className="dvcPill dvcPill--ok">{accountResetNotice}</span>
          </div>
        ) : null}
      </div>

      {/* ── Bottom nav ── */}
      <nav className="dvcNav" aria-label="Navigácia">
        <button className={view === "home" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("home")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12L12 4l9 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Eventy</span>
        </button>
        <button className={view === "calendar" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("calendar")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="8" cy="15" r="1.2" fill="currentColor"/>
            <circle cx="12" cy="15" r="1.2" fill="currentColor"/>
            <circle cx="16" cy="15" r="1.2" fill="currentColor"/>
          </svg>
          <span>Kalendár</span>
        </button>
        <button className={view === "map" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("map")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 20l-5-2V4l5 2m0 14l6-2m-6 2V6m6 12l5 2V6l-5-2m0 14V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Mapa</span>
        </button>
        <button className={view === "info" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("info")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 8v1M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>Info</span>
        </button>
      </nav>
    </div>
  );
};

export { App };
