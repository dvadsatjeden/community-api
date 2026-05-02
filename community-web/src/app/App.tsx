import * as E from "@evolu/common";
import { useDvcEvolu } from "./evolu/dvcEvolu";
import { allDvcRsvp, clearDvcRsvp, upsertDvcRsvp } from "./evolu/dvcEvoluQueries";
import type { RsvpStatus } from "./evolu/rsvpStatus";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { type DerivedAccount, deriveFromMnemonic, generateMnemonic, validateBip39Mnemonic } from "../features/account/seedRecovery";
import { NostrSignInModal } from "../features/nostr/NostrSignInModal";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./community-app.css";
import { dateParts, TZ } from "./utils";
import { EmbeddedOnly, usePlatform } from "./platform";
import logoMempoolUrl from "./logos/logo-mempool.svg?url";
import logoBtcmapUrl from "./logos/logo-btcmap.svg?url";
import logoBtcpayUrl from "./logos/logo-btcpay.svg?url";
import logoSatfluxUrl from "./logos/logo-satflux.svg?url";
import logoHydranodeUrl from "./logos/logo-hydranode.svg?url";

type EventItem = {
  id: string;
  title: string;
  startsAt: string;
  locationName?: string;
  city?: string;
  country?: string;
  region?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  free_entry?: boolean;
  ticket_link?: string;
  lat?: number;
  lng?: number;
};

type RsvpCounts = Record<RsvpStatus, number>;
type ViewName = "home" | "calendar" | "map" | "info" | "uvod";
const EVENT_CATEGORIES = ["MeetUpy", "Bitcoin Pivo", "Konferencie", "Ostatné"] as const;

type Community = { id: number; name: string; lat: number; lng: number; marker_image?: string };

type WpPost = {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  _embedded?: { "wp:featuredmedia"?: Array<{ source_url: string }> };
};

const VekslakIcon = (): ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dvcToolLogoPulse" aria-hidden="true">
    <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727" />
  </svg>
);

const TOOLS: Array<{ name: string; desc: string; url: string; emoji: string; logoUrl?: string; logoEl?: ReactElement }> = [
  { name: "Mempool",      desc: "Bloky a transakcie",        url: "https://mempool.dvadsatjeden.org", emoji: "⛏️", logoUrl: logoMempoolUrl },
  { name: "BTCPay Server",desc: "Vlastný BTC uzol",          url: "https://btcpayserver.org",        emoji: "⚡", logoUrl: logoBtcpayUrl },
  { name: "BTC Map",      desc: "Bitcoin prijímajú blízko",  url: "https://btcmap.org",              emoji: "🗺️", logoUrl: logoBtcmapUrl },
  { name: "Hydranode",    desc: "PoS terminál",              url: "https://hydranode.org",           emoji: "🖥️", logoUrl: logoHydranodeUrl },
  { name: "SATFLUX",      desc: "Prijímaj Bitcoin jednoducho", url: "https://satflux.io",            emoji: "🔭", logoUrl: logoSatfluxUrl },
  { name: "DCA Kalkulačka",desc: "Pravidelný nákup BTC",    url: "https://dca.dvadsatjeden.org",    emoji: "📈" },
  { name: "Vekslak",      desc: "Pomôcka pre výpočty",       url: "https://vekslak.dvadsatjeden.org",emoji: "₿",  logoEl: <VekslakIcon /> },
  { name: "CBDC.icu",     desc: "CBDC vs. Bitcoin",          url: "https://cbdc.icu",               emoji: "🏦" },
];


const emptyCounts = (): RsvpCounts => ({ going: 0, maybe: 0, not_going: 0 });
const RSVP_LOCAL_KEY = "d21.localRsvpByEvent";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_DEFAULT_API_BASE_URL ?? "http://localhost:3021";

/** Same directory as `community-app.js` — written at build do `assets/`. */
const resolveCommunityAppVersionCheckUrl = (): string | null => {
  const wp = document.querySelector<HTMLScriptElement>("#dvc-community-app-js[src]");
  if (wp?.src) {
    try {
      return new URL("community-app.version.json", wp.src).href;
    } catch {
      return null;
    }
  }
  const mod = document.querySelector<HTMLScriptElement>('script[type="module"][src*="community-app.js"]');
  if (mod?.src) {
    try {
      return new URL("community-app.version.json", mod.src).href;
    } catch {
      return null;
    }
  }
  const root = document.getElementById("dvadsatjeden-community-app");
  const configUrl = root?.dataset.configUrl ?? "";
  if (configUrl && !configUrl.includes("/wp-json/")) {
    try {
      return new URL("/assets/community-app.version.json", window.location.origin).href;
    } catch {
      return null;
    }
  }
  return null;
};

/** Obídenie CDN/proxy cache pri kontrole deployu (časová pečiatka v query; podobne ako jednadvacet `?t=`). */
const withVersionCheckCacheBust = (absoluteUrl: string): string => {
  try {
    const u = new URL(absoluteUrl);
    u.searchParams.set("_cb", String(Date.now()));
    return u.href;
  } catch {
    const sep = absoluteUrl.includes("?") ? "&" : "?";
    return `${absoluteUrl}${sep}_cb=${Date.now()}`;
  }
};

const LOCAL_SEMVER = String(__APP_VERSION__).trim();
const MY_BUILD_ID = String(__APP_BUILD_ID__).trim();

/** Standalone PWA registruje `/sw.js` (registerSW.js). Neukončujeme cudzie SW na tom istom origine. */
const DVC_SW_SCRIPT_PATH_SUFFIX = "/sw.js";

function dvcServiceWorkerScriptMatchesOurSw(scriptUrl: string | undefined): boolean {
  if (!scriptUrl) return false;
  try {
    return new URL(scriptUrl).pathname.endsWith(DVC_SW_SCRIPT_PATH_SUFFIX);
  } catch {
    return false;
  }
}

/** Workbox 7: `prefix-cacheId-suffix` so suffix = registration.scope (pozri sw bundle). */
function dvcWorkboxManagedCacheNamesForScope(scope: string): string[] {
  return [`workbox-precache-v2-${scope}`, `workbox-runtime-${scope}`];
}

async function dvcUnregisterOurStandaloneSwAndCaches(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  if (
    !dvcServiceWorkerScriptMatchesOurSw(
      registration.installing?.scriptURL ??
        registration.waiting?.scriptURL ??
        registration.active?.scriptURL,
    )
  ) {
    return;
  }
  const scope = registration.scope;
  await registration.unregister();

  if (!("caches" in window)) return;
  const cacheNames = dvcWorkboxManagedCacheNamesForScope(scope);
  await Promise.all(cacheNames.map((name) => caches.delete(name)));
}

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

const ToolLogo = ({ logoUrl, emoji }: { logoUrl: string | undefined; emoji: string }): ReactElement => {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <img className="dvcToolLogoImg" src={logoUrl} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return <span className="dvcToolEmoji">{emoji}</span>;
};

const WP_UPLOADS = "https://www.dvadsatjeden.org/wp-content/uploads/2023/09/";

const CommunityLogo = ({ community }: { community: Community }): ReactElement => {
  const cityName = community.name.replace(/^Dvadsatjeden\s+/, "").trim();
  const slug = cityName.toLowerCase().replace(/[\s/]+/g, "-");
  const [attempt, setAttempt] = useState(0);
  const urls = [
    community.marker_image || null,
    `${WP_UPLOADS}${cityName}.svg`,
    `${WP_UPLOADS}${cityName}.webp`,
    `${WP_UPLOADS}${slug}.svg`,
    `${WP_UPLOADS}${slug}.webp`,
  ].filter(Boolean) as string[];

  if (attempt >= urls.length) return <span className="dvcCommunityModalEmoji">₿</span>;
  return <img key={urls[attempt]} src={urls[attempt]} onError={() => setAttempt((a) => a + 1)} className="dvcCommunityModalLogo" alt="" />;
};

/** JSON shape in localStorage + IndexedDB (môže obsahovať seed do potvrdenia zálohy). */
type PersistedAccount = {
  ownerId: string;
  rsvpToken: string;
  dataKey?: string;
  mnemonic?: string;
  seedBackedUpConfirmed?: boolean;
  authMethod?: "bip39" | "nostr";
  nostrPubkeyBech32?: string;
};

function derivedAccountToPersisted(account: DerivedAccount): PersistedAccount {
  const dataKey = account.dataKey ?? "";
  const hasMnemonic = account.mnemonic.trim().length > 0;
  const pending = hasMnemonic && account.seedBackedUpConfirmed !== true;
  const persist: PersistedAccount = {
    ownerId: account.ownerId,
    rsvpToken: account.rsvpToken,
    dataKey,
  };
  if (pending) {
    persist.mnemonic = account.mnemonic.trim();
    persist.seedBackedUpConfirmed = false;
  } else {
    persist.seedBackedUpConfirmed = true;
  }
  if (account.authMethod) persist.authMethod = account.authMethod;
  if (account.nostrPubkeyBech32) persist.nostrPubkeyBech32 = account.nostrPubkeyBech32;
  return persist;
}

function persistedToDerived(p: PersistedAccount): DerivedAccount | null {
  if (!p.ownerId || !p.rsvpToken) return null;
  const dataKey = p.dataKey ?? "";
  const mn = typeof p.mnemonic === "string" ? p.mnemonic.trim() : "";

  if (p.seedBackedUpConfirmed === true) {
    return {
      ownerId: p.ownerId,
      rsvpToken: p.rsvpToken,
      dataKey,
      mnemonic: "",
      seedBackedUpConfirmed: true,
      authMethod: p.authMethod === "nostr" ? "nostr" : "bip39",
      nostrPubkeyBech32: typeof p.nostrPubkeyBech32 === "string" ? p.nostrPubkeyBech32 : undefined,
    };
  }

  if (p.authMethod === "nostr" && mn && validateBip39Mnemonic(mn)) {
    return {
      ownerId: p.ownerId,
      rsvpToken: p.rsvpToken,
      dataKey,
      mnemonic: mn,
      seedBackedUpConfirmed: false,
      authMethod: "nostr",
      nostrPubkeyBech32: typeof p.nostrPubkeyBech32 === "string" ? p.nostrPubkeyBech32 : undefined,
    };
  }

  if (mn && validateBip39Mnemonic(mn)) {
    let derived: DerivedAccount;
    try {
      derived = deriveFromMnemonic(mn);
    } catch (err) {
      console.warn("[d21] deriveFromMnemonic failed for persisted account", err);
      return {
        ownerId: p.ownerId,
        rsvpToken: p.rsvpToken,
        dataKey,
        mnemonic: mn,
        seedBackedUpConfirmed: false,
      };
    }
    if (derived.ownerId !== p.ownerId || derived.rsvpToken !== p.rsvpToken) {
      console.warn("[d21] persisted ownerId/rsvpToken do not match derived identity from mnemonic");
      return {
        ownerId: p.ownerId,
        rsvpToken: p.rsvpToken,
        dataKey,
        mnemonic: mn,
        seedBackedUpConfirmed: false,
      };
    }
    const isPending = p.seedBackedUpConfirmed === false || p.seedBackedUpConfirmed === undefined;
    return {
      ...derived,
      dataKey: dataKey || derived.dataKey,
      seedBackedUpConfirmed: isPending ? false : true,
    };
  }

  if (mn) {
    console.warn("[d21] persisted mnemonic failed BIP-39 validation");
  }
  return {
    ownerId: p.ownerId,
    rsvpToken: p.rsvpToken,
    dataKey,
    mnemonic: mn,
    seedBackedUpConfirmed: false,
  };
}

// ── IndexedDB backup (survives localStorage eviction) ──────────────────────
const IDB_NAME = "d21-storage";
const IDB_STORE = "kv";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAccount(): Promise<PersistedAccount | null> {
  try {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get("account");
      req.onsuccess = () => resolve((req.result as PersistedAccount) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbSetAccount(account: PersistedAccount | null): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve) => {
      const store = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE);
      const req = account ? store.put(account, "account") : store.delete("account");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch { /* silent fail */ }
}
// ──────────────────────────────────────────────────────────────────────────

function loadAccountFromStorage(): DerivedAccount | null {
  try {
    const raw = localStorage.getItem("d21.account");
    if (!raw) return null;
    return persistedToDerived(JSON.parse(raw) as PersistedAccount);
  } catch {
    return null;
  }
}

/** Returns true if localStorage.setItem succeeded; false if it threw. IndexedDB is always updated with the same persist blob. */
function saveAccountToStorage(account: DerivedAccount): boolean {
  const persist = derivedAccountToPersisted(account);
  let localStorageOk = true;
  try {
    localStorage.setItem("d21.account", JSON.stringify(persist));
  } catch {
    localStorageOk = false;
    try {
      localStorage.removeItem("d21.account");
    } catch {
      /* ignore — avoid leaving catch before finally if removeItem throws */
    }
  } finally {
    void idbSetAccount(persist);
  }
  return localStorageOk;
}

const App = (): ReactElement => {
  const dvc = useDvcEvolu();
  const dvcRsvpQuery = useMemo(() => allDvcRsvp(dvc), [dvc]);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [pushFeature, setPushFeature] = useState(false);
  const [pushStatus, setPushStatus] = useState<"unknown" | "subscribed" | "denied" | "unsupported">(() => {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return "unknown";
  });
  const [pushLoading, setPushLoading] = useState(false);
  const [eventsFeature, setEventsFeature] = useState(true);
  const [mapFeature, setMapFeature] = useState(true);
  const { mode, standaloneAppUrl, setStandaloneAppUrl } = usePlatform();
  const [configUrl, setConfigUrl] = useState(() => {
    const el = document.getElementById("dvadsatjeden-community-app");
    return el?.dataset.configUrl ?? "/wp-json/dvadsatjeden/v1/config";
  });
  const [events, setEvents] = useState<EventItem[]>([]);
  const [articles, setArticles] = useState<WpPost[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [mapLayers, setMapLayers] = useState<Set<string>>(() => new Set(["events", "communities"]));
  const [filterCountry, setFilterCountry] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMine, setFilterMine] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [suggestedSeed] = useState(() => generateMnemonic());
  const [account, setAccount] = useState<DerivedAccount | null>(() => loadAccountFromStorage());
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
  const [seedBackupSavedChecked, setSeedBackupSavedChecked] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  const [accountResetNotice, setAccountResetNotice] = useState<string | null>(null);
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [nostrLogin, setNostrLogin] = useState(false);
  const [isNostrSignInOpen, setIsNostrSignInOpen] = useState(false);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);
  const [communityDetail, setCommunityDetail] = useState<Community | null>(null);
  const [geoLocating, setGeoLocating] = useState(false);
  const [view, setView] = useState<ViewName>(() => mode === "standalone" ? "uvod" : "home");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const mapMarkersRef = useRef<L.Marker[]>([]);
  const communitiesMarkersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  useLayoutEffect(() => {
    if (window.__DVC_BOOT_TIMER != null) {
      window.clearTimeout(window.__DVC_BOOT_TIMER);
      window.__DVC_BOOT_TIMER = undefined;
    }
  }, []);

  const runServerVersionCheck = useCallback((): void => {
    const versionUrl = resolveCommunityAppVersionCheckUrl();
    if (!versionUrl) return;
    if (MY_BUILD_ID === "dev") {
      setNewVersionAvailable(false);
      return;
    }
    const fetchUrl = withVersionCheckCacheBust(versionUrl);
    void fetch(fetchUrl, { cache: "no-store", credentials: "omit" })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { version?: string; buildId?: string };
        const remoteBuildId = typeof data.buildId === "string" ? data.buildId.trim() : "";
        const remoteVer = typeof data.version === "string" ? data.version.trim() : "";
        if (remoteBuildId && MY_BUILD_ID) {
          setNewVersionAvailable(remoteBuildId !== MY_BUILD_ID);
          return;
        }
        if (remoteVer && LOCAL_SEMVER) {
          setNewVersionAvailable(remoteVer !== LOCAL_SEMVER);
          return;
        }
        setNewVersionAvailable(false);
      })
      .catch(() => {});
  }, []);

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
    if (navigator.storage?.persist) void navigator.storage.persist();
    if (loadAccountFromStorage()) return;
    void idbGetAccount().then((fromIDB) => {
      if (!fromIDB) {
        setIsAccountModalOpen(true);
        return;
      }
      const acc = persistedToDerived(fromIDB);
      if (!acc) {
        localStorage.removeItem("d21.account");
        void idbSetAccount(null);
        setIsAccountModalOpen(true);
        return;
      }
      const persist = derivedAccountToPersisted(acc);
      try {
        localStorage.setItem("d21.account", JSON.stringify(persist));
      } catch {
        /* non-fatal */
      }
      void idbSetAccount(persist);
      setAccount(acc);
    });
  }, []);

  useEffect(() => {
    if (!resolveCommunityAppVersionCheckUrl()) return;
    runServerVersionCheck();
    const intervalId = window.setInterval(runServerVersionCheck, 3 * 60 * 1000);
    const onVis = (): void => {
      if (document.visibilityState === "visible") runServerVersionCheck();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [runServerVersionCheck]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /** Nový SW / deploy — po `updatefound` znova skontrolujeme `community-app.version.json` zo siete. */
    let debounced: ReturnType<typeof setTimeout> | undefined;
    const scheduleVersionRecheck = (): void => {
      window.clearTimeout(debounced);
      debounced = window.setTimeout(() => runServerVersionCheck(), 750);
    };

    let unregisterUpdateFound: (() => void) | undefined;
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.addEventListener("updatefound", scheduleVersionRecheck);
      unregisterUpdateFound = () => reg.removeEventListener("updatefound", scheduleVersionRecheck);
    });

    const swUpdatePollId = window.setInterval(() => {
      void navigator.serviceWorker.getRegistration().then((reg) => void reg?.update());
    }, 30 * 60 * 1000);

    return () => {
      window.clearTimeout(debounced);
      unregisterUpdateFound?.();
      window.clearInterval(swUpdatePollId);
    };
  }, [runServerVersionCheck]);

  useEffect(() => {
    if (!account) {
      setEvoluReady(false);
      setIsSeedVisible(false);
      setSeedBackupSavedChecked(false);
      setEvoluError(null);
      setIsEvoluConnecting(false);
      setLocalRsvpByEvent(new Map());
      setClearedRsvpEventIds(new Set());
      setRsvpSource("local");
      return;
    }
    setLocalRsvpByEvent(loadLocalRsvpMap(account.ownerId));
    if (account.mnemonic) {
      // Fresh session: seed just entered — restore Evolu owner and sync from relay
      void syncEvolu(account.mnemonic);
    } else {
      // Returning session: Evolu already has owner in its own persistent storage
      setEvoluReady(true);
    }
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
    const mount = document.getElementById("dvadsatjeden-community-app");
    const fallbackFromMount = (): string => {
      const fromData = mount?.dataset.apiBaseUrl?.trim();
      return fromData && fromData.length > 0 ? fromData : DEFAULT_API_BASE_URL;
    };
    void fetch(configUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{
          apiBaseUrl?: string;
          standaloneAppUrl?: string;
          vapidPublicKey?: string;
          features?: { events?: boolean; map?: boolean; push?: boolean; nostrLogin?: boolean };
        }>;
      })
      .then((cfg) => {
        if (typeof cfg.apiBaseUrl === "string" && cfg.apiBaseUrl.trim().length > 0) {
          setApiBaseUrl(cfg.apiBaseUrl.trim());
        } else {
          setApiBaseUrl(fallbackFromMount());
        }
        const sau = typeof cfg.standaloneAppUrl === "string" ? cfg.standaloneAppUrl.trim() : "";
        setStandaloneAppUrl(sau.length > 0 ? sau : null);
        if (typeof cfg.vapidPublicKey === "string" && cfg.vapidPublicKey.trim().length > 0) {
          setVapidPublicKey(cfg.vapidPublicKey.trim());
        }
        if (typeof cfg.features?.events === "boolean") setEventsFeature(cfg.features.events);
        if (typeof cfg.features?.map === "boolean") setMapFeature(cfg.features.map);
        if (cfg.features?.push === true) setPushFeature(true);
        setNostrLogin(cfg.features?.nostrLogin === true);
      })
      .catch(() => {
        setApiBaseUrl(fallbackFromMount());
        setStandaloneAppUrl(null);
      });
  }, [configUrl, setStandaloneAppUrl]);

  useEffect(() => {
    if (!eventsFeature) {
      setMapLayers((prev) => {
        if (!prev.has("events")) return prev;
        const next = new Set(prev);
        next.delete("events");
        return next;
      });
    }
  }, [eventsFeature]);

  useEffect(() => {
    if (!eventsFeature && (view === "home" || view === "calendar")) {
      if (mapFeature) setView("map");
      else if (mode === "standalone") setView("uvod");
      else setView("info");
    }
  }, [eventsFeature, view, mapFeature, mode]);

  useEffect(() => {
    if (!mapFeature && view === "map") {
      if (eventsFeature) setView("home");
      else if (mode === "standalone") setView("uvod");
      else setView("info");
    }
  }, [mapFeature, view, eventsFeature, mode]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    if (!eventsFeature) {
      setEvents([]);
      return;
    }
    const params = new URLSearchParams({ future: "1", sort: "asc" });
    void fetch(`${apiBaseUrl}/v1/events?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => setEvents((data.items ?? []) as EventItem[]))
      .catch(() => setEvents([]));
  }, [apiBaseUrl, eventsFeature]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    void fetch(`${apiBaseUrl}/v1/articles`)
      .then((r) => r.json())
      .then((data) => setArticles(Array.isArray(data) ? (data as WpPost[]) : []))
      .catch(() => {});
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    void fetch(`${apiBaseUrl}/v1/communities`)
      .then((r) => r.json())
      .then((data) => {
        const items = (data as { items?: Community[] }).items;
        setCommunities(Array.isArray(items) ? items : []);
      })
      .catch(() => {});
  }, [apiBaseUrl]);

  const toggleMapLayer = (layer: string) => setMapLayers((prev) => {
    const next = new Set(prev);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    return next;
  });

  const locateMe = (): void => {
    if (!navigator.geolocation) return;
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        const map = leafletMapRef.current;
        if (!map) return;
        map.setView([lat, lng], 11);
        if (userMarkerRef.current) userMarkerRef.current.remove();
        const icon = L.divIcon({ className: "", html: '<div class="dvcMapUserMarker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
        userMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        const nearest = communities.reduce<Community | null>((best, c) => {
          const d = Math.hypot(c.lat - lat, c.lng - lng);
          if (!best) return c;
          return d < Math.hypot(best.lat - lat, best.lng - lng) ? c : best;
        }, null);
        if (nearest) setCommunityDetail(nearest);
      },
      () => setGeoLocating(false),
      { timeout: 8000 },
    );
  };

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
      if (communityDetail) { setCommunityDetail(null); return; }
      if (isNostrSignInOpen) { setIsNostrSignInOpen(false); return; }
      if (isAccountModalOpen) setIsAccountModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxImageUrl, detailEvent, communityDetail, isAccountModalOpen, isNostrSignInOpen]);

  useEffect(() => {
    if (isAccountModalOpen && account?.mnemonic) {
      setSeedBackupSavedChecked(false);
    }
  }, [isAccountModalOpen, account?.ownerId, account?.mnemonic]);

  const confirmSeedBackedUp = (): void => {
    if (!account?.mnemonic) return;
    if (!seedBackupSavedChecked || !evoluReady || isEvoluConnecting) return;
    const next: DerivedAccount = { ...account, seedBackedUpConfirmed: true };
    if (!saveAccountToStorage(next)) {
      setAccountResetNotice("Upozornenie: potvrdenie zálohy sa nepodarilo uložiť — skús znova.");
      window.setTimeout(() => setAccountResetNotice(null), 5000);
      return;
    }
    setAccount({ ...next, mnemonic: "" });
    setIsSeedVisible(false);
    setSeedBackupSavedChecked(false);
    setAccountResetNotice(null);
  };

  const onNostrSignInSuccess = useCallback((next: DerivedAccount) => {
    setAccount(next);
    if (!saveAccountToStorage(next)) {
      setAccountResetNotice("Upozornenie: účet sa nepodarilo uložiť — skús znova.");
      window.setTimeout(() => setAccountResetNotice(null), 5000);
    }
    setIsNostrSignInOpen(false);
    setIsAccountModalOpen(false);
  }, []);

  const createAccount = (): void => {
    const next = deriveFromMnemonic(suggestedSeed);
    setAccount(next);
    if (!saveAccountToStorage(next)) {
      setAccountResetNotice("Upozornenie: účet sa nepodarilo uložiť — pri ďalšom načítaní bude potrebné zadať seed znova.");
      window.setTimeout(() => setAccountResetNotice(null), 5000);
    }
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
    if (!saveAccountToStorage(restored)) {
      setAccountResetNotice("Upozornenie: účet sa nepodarilo uložiť — pri ďalšom načítaní bude potrebné zadať seed znova.");
      window.setTimeout(() => setAccountResetNotice(null), 5000);
    }
    setIsAccountModalOpen(false);
  };

  const resetAccountOnDevice = (): void => {
    localStorage.removeItem("d21.account");
    void idbSetAccount(null);
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
    setSeedBackupSavedChecked(false);
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

  // Init Leaflet + update markers and GeoJSON layers
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

    // Events layer
    mapMarkersRef.current.forEach((m) => m.remove());
    mapMarkersRef.current = [];
    if (mapLayers.has("events") && eventsFeature) {
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
    }

    // Communities layer (point markers)
    communitiesMarkersRef.current.forEach((m) => m.remove());
    communitiesMarkersRef.current = [];
    if (mapLayers.has("communities")) {
      for (const c of communities) {
        const icon = L.divIcon({
          className: "",
          html: `<div class="dvcMapCommunityMarker"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([c.lat, c.lng], { icon });
        marker.bindTooltip(c.name, { direction: "top", offset: [0, -10] });
        marker.on("click", () => setCommunityDetail(c));
        marker.addTo(map);
        communitiesMarkersRef.current.push(marker);
      }
    }
  }, [view, events, mapLayers, communities, eventsFeature]);

  // ── Push notifications ───────────────────────────────────────────────────

  const urlB64ToUint8Array = (b64: string): Uint8Array => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  useEffect(() => {
    if (pushStatus === "unsupported" || !vapidPublicKey) return;
    void navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (existing) setPushStatus("subscribed");
    });
  }, [vapidPublicKey, pushStatus]);

  const subscribePush = async (): Promise<void> => {
    if (!vapidPublicKey || !apiBaseUrl) return;
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setPushStatus("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidPublicKey) as unknown as string,
      });
      await fetch(`${apiBaseUrl}/v1/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setPushStatus("subscribed");
    } catch { /* user cancelled or error */ }
    finally { setPushLoading(false); }
  };

  const unsubscribePush = async (): Promise<void> => {
    if (!apiBaseUrl) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${apiBaseUrl}/v1/push/subscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushStatus("unknown");
    } catch { /* ignore */ }
    finally { setPushLoading(false); }
  };

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

  const filteredEventGroups = useMemo(() => {
    const map = new Map<string, { label: string; evs: EventItem[] }>();
    for (const ev of filteredEvents) {
      const d = new Date(ev.startsAt);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { label: d.toLocaleString("sk-SK", { month: "long", year: "numeric", timeZone: TZ }), evs: [] });
      map.get(key)!.evs.push(ev);
    }
    return Array.from(map.values());
  }, [filteredEvents]);

  return (
    <div className="dvc">
      <div className="dvcShell">
        {view === "home" ? (<>
        <div className="dvcGrid dvcGrid--spaced">
          <div className="dvcCard dvcCard--wide dvcCard--events">
            <div className="dvcCardTitleRow">
              <h2 className="dvcCardTitle">Budúce udalosti</h2>
              <a className="dvcBtn dvcBtn--add" href="https://prevadzky.dvadsatjeden.org/pridat/" target="_blank" rel="noreferrer">+ Pridať</a>
            </div>
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
              {filteredEventGroups.map(({ label, evs }) => (
              <React.Fragment key={label}>
                <div className="dvcEventMonthDivider">{label}</div>
              {evs.map((event) => {
                const parts = dateParts(event.startsAt);
                const counts = countsByEvent[event.id] ?? emptyCounts();
                const mine = clearedRsvpEventIds.has(event.id) ? undefined : (localRsvpByEvent.get(event.id) ?? myRsvpByEvent.get(event.id));
                return (
                  <article className="dvcEvent" key={event.id}>
                    <div className="dvcEventBadges">
                      {event.category ? <span className="dvcEventCategory">{event.category}</span> : null}
                      {event.free_entry ? <span className="dvcEventCategory dvcEventCategory--free">Vstup voľný</span> : null}
                    </div>
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
                      {!event.free_entry && event.ticket_link ? (
                        <a className="dvcBtn dvcBtn--rsvp dvcBtn--ticket" href={event.ticket_link} target="_blank" rel="noreferrer">Kúpiť vstupenku</a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        </>) : null}

        {/* ── Úvod view ── */}
        {view === "uvod" ? (
          <div className="dvcUvodView">
            <header className="dvcUvodHeader">
              <img
                className="dvcUvodLogo"
                src="https://www.dvadsatjeden.org/wp-content/uploads/2023/09/Logo-Mensie.svg"
                alt="Dvadsatjeden.org"
                loading="eager"
              />
              <p className="dvcUvodTagline">Bitcoin komunita na Slovensku</p>
            </header>

            <section className="dvcUvodSection">
              <h2 className="dvcUvodSectionTitle">Kde začať</h2>
              <div className="dvcKdeZacatStack">
                <EmbeddedOnly>
                  {standaloneAppUrl ? (
                    <div className="dvcKdeZacatCard">
                      <h3 className="dvcKdeZacatCardTitle">Úvod</h3>
                      <p className="dvcMuted">
                        Komunitná appka ako samostatná PWA — inštalácia do zariadenia, offline režim a push upozornenia.
                      </p>
                      <a className="dvcBtn dvcBtnPrimary" href={standaloneAppUrl} target="_blank" rel="noreferrer">
                        Otvoriť v appke
                      </a>
                    </div>
                  ) : null}
                </EmbeddedOnly>
                <div className="dvcKdeZacat">
                  <p className="dvcMuted">
                    Dvadsatjeden je komunita, ktorá prepája Bitcoinerov, šíri osvetu a edukuje.
                    Pravidelne organizujeme meetupy, Bitcoin pivo stretnutia a konferencie.
                    Najrýchlejšie sa zapojíš cez Signal skupinu — tam sa dozvieš o novinkách ako prvý.
                  </p>
                  <div className="dvcRow">
                    <button
                      className="dvcBtn dvcBtnPrimary"
                      type="button"
                      onClick={() => (mapFeature ? setView("map") : setView("info"))}
                    >
                      Pripojiť sa do skupiny
                    </button>
                    <a className="dvcBtn dvcBtnGhost" href="https://www.dvadsatjeden.org" target="_blank" rel="noreferrer">
                      Viac o komunite
                    </a>
                  </div>
                </div>
              </div>
            </section>

            <section className="dvcUvodSection">
              <h2 className="dvcUvodSectionTitle">Ako to funguje</h2>
              <div className="dvcFeatureGrid">
                <button type="button" className="dvcFeatureCard dvcFeatureCard--link" onClick={() => setView("calendar")}>
                  <span className="dvcFeatureIcon">📅</span>
                  <span className="dvcFeatureName">Kalendár eventov</span>
                  <span className="dvcFeatureDesc">Prehľad všetkých Bitcoin akcií na Slovensku — filtruj podľa kraja alebo kategórie.</span>
                </button>
                <button type="button" className="dvcFeatureCard dvcFeatureCard--link" onClick={() => setView("map")}>
                  <span className="dvcFeatureIcon">🗺️</span>
                  <span className="dvcFeatureName">Mapa komunít</span>
                  <span className="dvcFeatureDesc">Zobrazuje lokálne Signal skupiny a eventy na interaktívnej mape Slovenska.</span>
                </button>
                <div className="dvcFeatureCard">
                  <span className="dvcFeatureIcon">🔐</span>
                  <span className="dvcFeatureName">Anonymný účet</span>
                  <span className="dvcFeatureDesc">Identita tvorená 12-slovným BIP-39 seedom. Žiadna emailová adresa ani registrácia.</span>
                </div>
                <div className="dvcFeatureCard">
                  <span className="dvcFeatureIcon">✅</span>
                  <span className="dvcFeatureName">RSVP bez registrácie</span>
                  <span className="dvcFeatureDesc">Oznám účasť na evente anonymne. Tvoj seed sa nikdy neposiela na server.</span>
                </div>
                <div className="dvcFeatureCard">
                  <span className="dvcFeatureIcon">🔔</span>
                  <span className="dvcFeatureName">Push notifikácie</span>
                  <span className="dvcFeatureDesc">Dostávaj upozornenia na nové eventy priamo do prehliadača cez Web Push.</span>
                </div>
                <button type="button" className="dvcFeatureCard dvcFeatureCard--link" onClick={() => setView("info")}>
                  <span className="dvcFeatureIcon">📲</span>
                  <span className="dvcFeatureName">Inštalovateľná PWA</span>
                  <span className="dvcFeatureDesc">Nainštaluj ako natívnu appku na mobil alebo počítač — funguje aj offline.</span>
                </button>
              </div>
            </section>

            <section className="dvcUvodSection">
              <div className="dvcUvodSectionHeader">
                <h2 className="dvcUvodSectionTitle">Najnovšie články</h2>
                <a className="dvcUvodSectionMore" href="https://www.dvadsatjeden.org/blog/" target="_blank" rel="noreferrer">
                  Všetky články →
                </a>
              </div>
              {articles.length === 0 ? (
                <div className="dvcEmpty">Načítavam články…</div>
              ) : (
                <div className="dvcArticleList">
                  {articles.map((post) => (
                    <a key={post.id} className="dvcArticleCard" href={post.link} target="_blank" rel="noreferrer">
                      {post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ? (
                        <div className="dvcArticleImg">
                          <img src={post._embedded["wp:featuredmedia"][0].source_url} alt="" loading="lazy" />
                        </div>
                      ) : null}
                      <div className="dvcArticleBody">
                        <span className="dvcArticleTitle" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                        <span className="dvcArticleDate">
                          {new Date(post.date).toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="dvcUvodSection">
              <h2 className="dvcUvodSectionTitle">Nástroje</h2>
              <div className="dvcToolGrid">
                {TOOLS.map((tool) => (
                  <a key={tool.url} className="dvcToolCard" href={tool.url} target="_blank" rel="noreferrer">
                    <div className="dvcToolIconWrap">
                      {tool.logoEl ?? <ToolLogo logoUrl={tool.logoUrl} emoji={tool.emoji} />}
                    </div>
                    <span className="dvcToolName">{tool.name}</span>
                    <span className="dvcToolDesc">{tool.desc}</span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {/* ── Calendar view ── */}
        {view === "calendar" ? (
          <div className="dvcCalView">
            <header className="dvcViewHeader">
              <h2 className="dvcViewTitle">Najbližšie udalosti</h2>
              <a
                className="dvcBtn dvcBtn--add"
                href="https://prevadzky.dvadsatjeden.org/pridat/"
                target="_blank"
                rel="noreferrer"
              >
                + Pridať
              </a>
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
                        {ev.free_entry ? <span className="dvcCalFree">Vstup voľný</span> : null}
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
          <div className="dvcMapLayerBar">
            {eventsFeature ? (
            <button
              className={`dvcMapLayerChip${mapLayers.has("events") ? " dvcMapLayerChip--active" : ""}`}
              type="button"
              onClick={() => toggleMapLayer("events")}
            >
              Eventy
            </button>
            ) : null}
            <button
              className={`dvcMapLayerChip${mapLayers.has("communities") ? " dvcMapLayerChip--active" : ""}`}
              type="button"
              onClick={() => toggleMapLayer("communities")}
            >
              Komunity
            </button>
            <button className="dvcMapLayerChip dvcMapLayerChip--soon" type="button" disabled>
              Obchodníci
            </button>
            <button
              className={`dvcMapLocateBtn${geoLocating ? " dvcMapLocateBtn--loading" : ""}`}
              type="button"
              onClick={locateMe}
              aria-label="Nájdi moju komunitu"
              disabled={geoLocating}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="8" y1="1" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="8" y1="11.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="1" y1="8" x2="4.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="11.5" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {geoLocating ? "Hľadám…" : "Moja poloha"}
            </button>
          </div>
          <div className="dvcMapLegend" aria-hidden="true">
            <span className="dvcMapLegendItem"><span className="dvcMapLegendDot dvcMapLegendDot--event" />Eventy — Bitcoin akcie</span>
            <span className="dvcMapLegendItem"><span className="dvcMapLegendDot dvcMapLegendDot--community" />Komunity — Signal skupiny</span>
          </div>
          <div ref={mapContainerRef} className="dvcMapContainer" />
        </div>

        {/* ── Info / Nastavenia view ── */}
        {view === "info" ? (
          <div className="dvcInfoView">
            <div className="dvcCard" style={{ marginBottom: "12px" }}>
              <h2 className="dvcCardTitle">Profil</h2>
              <div className="dvcRow" style={{ justifyContent: "space-between", gap: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {account ? (
                    <div className="dvcPillGroup" style={{ marginBottom: 0 }}>
                      <span className="dvcPill dvcPill--ok">Účet aktívny</span>
                      {evoluReady ? <span className="dvcPill dvcPill--ok">Sync: OK</span> : null}
                      {!evoluReady && isEvoluConnecting ? <span className="dvcPill dvcPill--wait">Syncing…</span> : null}
                    </div>
                  ) : (
                    <p className="dvcMuted" style={{ margin: 0 }}>Bez účtu — RSVP nefunguje.</p>
                  )}
                </div>
                <button
                  className={`dvcBtn ${account ? "dvcBtnGhost" : "dvcBtnPrimary"}`}
                  type="button"
                  onClick={() => setIsAccountModalOpen(true)}
                  style={{ flexShrink: 0 }}
                >
                  {account ? "Môj účet" : "Vytvor účet"}
                </button>
              </div>
            </div>
            {pushFeature && pushStatus !== "unsupported" ? (
              <div className="dvcCard" style={{ marginBottom: "12px" }}>
                <h2 className="dvcCardTitle">Notifikácie</h2>
                {!vapidPublicKey && pushStatus !== "subscribed" ? (
                  <p className="dvcMuted">
                    Push je zapnutý v nastaveniach webu, ale server nevrátil VAPID kľúč. Skontroluj API alebo dočasne vypni funkciu Push v administrácii.
                  </p>
                ) : pushStatus === "denied" ? (
                  <p className="dvcMuted">Notifikácie sú zablokované v nastaveniach prehliadača.</p>
                ) : pushStatus === "subscribed" ? (
                  <div>
                    <p className="dvcMuted" style={{ marginBottom: "10px" }}>Dostaneš upozornenie keď pribudnú nové eventy.</p>
                    <button className="dvcBtn dvcBtn--ghost" type="button" disabled={pushLoading} onClick={() => void unsubscribePush()}>
                      {pushLoading ? "…" : "Vypnúť notifikácie"}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="dvcMuted" style={{ marginBottom: "10px" }}>Zapni upozornenia na nové Bitcoin eventy.</p>
                    <button className="dvcBtn" type="button" disabled={pushLoading || !vapidPublicKey} onClick={() => void subscribePush()}>
                      {pushLoading ? "…" : "🔔 Povoliť notifikácie"}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            <div className="dvcCard dvcCard--accent">
              <h2 className="dvcCardTitle">O aplikácii</h2>
              <p className="dvcMuted" style={{ marginBottom: "10px" }}>Komunitná aplikácia pre Bitcoinerov na Slovensku. Sleduj eventy, oznam účasť anonymne — bez registrácie, len 12 slov ako kľúč.</p>
              <p className="dvcMuted">
                Verzia {__APP_VERSION__}
                {MY_BUILD_ID !== "dev" ? ` (${MY_BUILD_ID})` : null} ·{" "}
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
                  {detailEvent.free_entry ? <span className="dvcEventCategory dvcEventCategory--modal dvcEventCategory--free">Vstup voľný</span> : null}
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
                    {!detailEvent.free_entry && detailEvent.ticket_link ? (
                      <a className="dvcBtn dvcBtn--ticket" href={detailEvent.ticket_link} target="_blank" rel="noreferrer">
                        Kúpiť vstupenku
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{marginLeft:"6px",verticalAlign:"middle"}}><path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M8 1h3v3M11 1 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </a>
                    ) : null}
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

        {communityDetail ? (() => {
          const cityName = communityDetail.name.replace(/^Dvadsatjeden\s+/, "").trim();
          const now = new Date();
          const communityEvents = events
            .filter((ev) => {
              const evCity = ev.city ?? ev.locationName ?? "";
              return evCity === cityName || evCity.split(/[,/]+/).some((p) => p.trim() === cityName);
            })
            .filter((ev) => new Date(ev.startsAt) >= now)
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
            .slice(0, 4);
          return (
            <div className="dvcModal" role="dialog" aria-modal="true" aria-label={communityDetail.name} onClick={() => setCommunityDetail(null)}>
              <div className="dvcModalPanel dvcCommunityModalPanel" key={communityDetail.id} onClick={(e) => e.stopPropagation()}>
                <button className="dvcModalClose" type="button" onClick={() => setCommunityDetail(null)} aria-label="Zatvoriť">×</button>

                <div className="dvcCommunityModalHeader">
                  <div className="dvcCommunityModalLogoWrap">
                    <CommunityLogo community={communityDetail} />
                  </div>
                  <div className="dvcCommunityModalMeta">
                    <h2 className="dvcCommunityModalName">{communityDetail.name}</h2>
                    <span className="dvcCommunityModalCity">{cityName}</span>
                  </div>
                </div>

                {communityEvents.length > 0 ? (
                  <div className="dvcCommunityModalEvents">
                    <h3 className="dvcCommunityModalSectionTitle">Najbližšie akcie</h3>
                    {communityEvents.map((ev) => {
                      const d = new Date(ev.startsAt);
                      const day = d.toLocaleString("sk-SK", { day: "numeric", month: "short", timeZone: TZ });
                      const time = d.toLocaleString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
                      return (
                        <button key={ev.id} className="dvcCommunityModalEvent" type="button"
                          onClick={() => { setCommunityDetail(null); setDetailEvent(ev); }}>
                          <span className="dvcCommunityModalEventDate">{day}</span>
                          <span className="dvcCommunityModalEventInfo">
                            <span className="dvcCommunityModalEventTitle">{ev.title}</span>
                            <span className="dvcCommunityModalEventTime">{time}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="dvcCommunityModalJoin">
                  <p className="dvcCommunityModalJoinNote">Pripojiť sa do lokálnej Signal skupiny</p>
                  <a
                    className="dvcBtn dvcBtnPrimary dvcCommunityModalJoinBtn"
                    href={`${apiBaseUrl}/v1/communities/${communityDetail.id}/join`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setCommunityDetail(null)}
                  >
                    Otvoriť Signal skupinu
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ marginLeft: "6px", verticalAlign: "middle" }}><path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7M8 1h3v3M11 1 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>
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
                  <h2 className="dvcModalTitle">Vytvor účet</h2>
                  <p className="dvcMuted dvcMuted--sm" style={{ marginBottom: "20px" }}>
                    Tvoj účet je týchto 12 slov. Ulož si ich — ak ich stratíš, stratíš prístup k svojim RSVP. Nikto iný ich nevidí, ani my.
                  </p>

                  <div className="dvcFieldRow">
                    <div>
                      <div className="dvcLabel">
                        ⚠️ Zapíš si tieto slová skôr, ako klikneš na tlačidlo
                      </div>
                      <SeedTable mnemonic={suggestedSeed} />
                    </div>
                    <div className="dvcRow">
                      <button className="dvcBtn dvcBtnPrimary" type="button" onClick={createAccount} disabled={!suggestedSeed}>
                        Zapísal som si ich — vytvoriť účet
                      </button>
                    </div>

                    <hr className="dvcDivider" />

                    <div>
                      <div className="dvcLabel">Máš existujúci účet? Vlož svojich 12 slov</div>
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

                    {nostrLogin && apiBaseUrl ? (
                      <>
                        <hr className="dvcDivider" />
                        <p className="dvcMuted dvcMuted--sm">
                          Máš Nostr kľúč? Prihlásenie bez vlastných 12 slov (server vydá zodpovedajúci lokálny Evolu seed po overení podpisu).
                        </p>
                        <div className="dvcRow">
                          <button className="dvcBtn dvcBtnGhost" type="button" onClick={() => setIsNostrSignInOpen(true)}>
                            Prihlásiť sa cez Nostr
                          </button>
                        </div>
                      </>
                    ) : null}
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

                    {account.nostrPubkeyBech32 ? (
                      <div>
                        <div className="dvcLabel">Nostr npub (verejné)</div>
                        <code className="dvcCodeInline" style={{ wordBreak: "break-all" }}>{account.nostrPubkeyBech32}</code>
                      </div>
                    ) : null}

                    <div>
                      <div className="dvcLabel">
                        {account.authMethod === "nostr" ? "Záloha — lokálne slová pre Evolu (nikomu neposielaj)" : "Záloha — 12 slov (nikomu neposielaj)"}
                      </div>
                      {account.mnemonic ? (
                        <>
                          <div className="dvcSeedBackupConfirmRow">
                            <input
                              id="dvc-seed-backup-ack"
                              className="dvcSeedBackupConfirmCheckbox"
                              type="checkbox"
                              checked={seedBackupSavedChecked}
                              onChange={(e) => setSeedBackupSavedChecked(e.target.checked)}
                            />
                            <label htmlFor="dvc-seed-backup-ack" className="dvcSeedBackupConfirmLabel">
                              {account.authMethod === "nostr" ? (
                                <>Mám zálohu Nostr kľúča (nsec) alebo trvalý prístup cez rozšírenie/bunker mimo tohto zariadenia a uvedomujem si, že tieto slová sú rovnako citlivé ako seed.</>
                              ) : (
                                <>Mám seed bezpečne uložený mimo tohto zariadenia (papier, správca hesiel, …).</>
                              )}
                            </label>
                          </div>
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
                          {seedBackupSavedChecked && (!evoluReady || isEvoluConnecting) ? (
                            <p className="dvcMuted dvcMuted--sm" style={{ marginTop: "10px" }}>
                              Pred potvrdením počkaj, kým bude Evolu pripravené. Ak sa pripojenie nepodarí, použi „Skúsiť znova“ nižšie.
                            </p>
                          ) : null}
                          <div className="dvcRow" style={{ marginTop: "12px" }}>
                            <button
                              className="dvcBtn dvcBtnPrimary"
                              type="button"
                              onClick={confirmSeedBackedUp}
                              disabled={!seedBackupSavedChecked || !evoluReady || isEvoluConnecting}
                            >
                              {account.authMethod === "nostr" ? "Potvrdiť uloženie — slová vymažem z tohto zariadenia" : "Potvrdiť uloženie — seed vymažem z tohto zariadenia"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="dvcMuted dvcMuted--sm">
                          {account.authMethod === "nostr" ? (
                            <>Na tomto zariadení máš potvrdenú zálohu. Lokálne slová pre Evolu tu už neukladáme — na inom zariadení sa znova prihlás cez Nostr s rovnakým kľúčom.</>
                          ) : (
                            <>Na tomto zariadení máš potvrdené, že máš zálohu uloženú mimo aplikácie. Seed tu už neukladáme - na inom zariadení zadaj tých istých 12 slov.</>
                          )}
                        </p>
                      )}
                    </div>

                    {evoluError ? (
                      <div className="dvcRow">
                        <span className="dvcPill dvcPill--wait">{evoluError}</span>
                        {account.mnemonic ? (
                          <button className="dvcBtn" type="button" onClick={() => void syncEvolu(account.mnemonic)}>
                            Skúsiť znova
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    <hr className="dvcDivider" />

                    <div className="dvcRow">
                      <button className="dvcBtn" type="button" onClick={resetAccountOnDevice}>
                        Vymazať účet na tomto zariadení
                      </button>
                    </div>
                    <p className="dvcMuted dvcMuted--sm">
                      {account.authMethod === "nostr"
                        ? "Rovnaké Nostr prihlásenie na inom zariadení obnoví tvoj účet aj RSVP históriu."
                        : "Rovnaký seed na inom zariadení obnoví tvoj účet aj RSVP históriu."}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {apiBaseUrl ? (
          <NostrSignInModal
            apiBaseUrl={apiBaseUrl}
            isOpen={isNostrSignInOpen}
            onClose={() => setIsNostrSignInOpen(false)}
            onSuccess={onNostrSignInSuccess}
          />
        ) : null}

        {accountResetNotice ? (
          <div className="dvcToast">
            <span className="dvcPill dvcPill--ok">{accountResetNotice}</span>
          </div>
        ) : null}
        {newVersionAvailable ? (
          <div className="dvcUpdateBanner" role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span className="dvcUpdateBannerText">
              <strong>Nová verzia je dostupná.</strong> Načítaj znova pre najnovší obsah.
            </span>
            <button
              type="button"
              className="dvcUpdateBannerBtn"
              disabled={isReloading}
              onClick={() => {
                setIsReloading(true);
                void (async () => {
                  try {
                    await dvcUnregisterOurStandaloneSwAndCaches();
                  } catch {
                    /* best-effort; aj tak navigácia */
                  }
                  try {
                    const u = new URL(window.location.href);
                    u.searchParams.set("dvc_sw", String(Date.now()));
                    window.location.replace(u.href);
                  } catch {
                    window.location.replace(`${window.location.pathname}?dvc_sw=${Date.now()}${window.location.hash}`);
                  }
                })();
              }}
            >
              {isReloading ? "Načítavam…" : "Načítať"}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Bottom nav ── */}
      <nav className="dvcNav" aria-label="Navigácia">
        <button className={view === "uvod" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("uvod")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12L12 4l9 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Úvod</span>
        </button>
        {eventsFeature ? (
        <button className={view === "home" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("home")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="8" cy="15" r="1.2" fill="currentColor"/>
            <circle cx="12" cy="15" r="1.2" fill="currentColor"/>
            <circle cx="16" cy="15" r="1.2" fill="currentColor"/>
          </svg>
          <span>Kalendár</span>
        </button>
        ) : null}
        {mapFeature ? (
        <button className={view === "map" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("map")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 20l-5-2V4l5 2m0 14l6-2m-6 2V6m6 12l5 2V6l-5-2m0 14V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Mapa</span>
        </button>
        ) : null}
        <button className={view === "info" ? "dvcNavItem dvcNavItem--active" : "dvcNavItem"} type="button" onClick={() => setView("info")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span>Nastavenia</span>
        </button>
      </nav>
    </div>
  );
};

export { App };
