# CLAUDE.md — community-api

Dokumentácia pre AI asistenta. Popisuje architektúru, deployment flow a čo robiť pri zmenách.

---

## Čo tento repozitár je

Monorepozitár s tromi komponentmi:

| Zložka | Čo je | Kde beží |
|---|---|---|
| `app/` | Node.js/Express/TypeScript REST API | Docker na tomto serveri (api.dvadsatjeden.org) |
| `community-web/` | React 19 PWA (Vite build) | Kompiluje sa do WP pluginu |
| `wp-content/plugins/dvadsatjeden-community/` | WordPress plugin (PHP) | **Externý WP hosting** (dvadsatjeden.org) |

**WordPress beží na inom hostingu** — nie na tomto serveri. Zmeny v `wp-content/` sa **automaticky nedostanú na produkciu**. Treba ručne nahrať ZIP cez WP admin.

---

## Architektúra a tok

```
Prehliadač
  │
  ├── HTTPS → www.dvadsatjeden.org (externý WP hosting)
  │     └── WP plugin shortcode [dvadsatjeden_community_app]
  │           ├── Načíta assets/community-app.js  (React PWA bundle)
  │           ├── Načíta assets/community-app.css
  │           └── REST endpoint /wp-json/dvadsatjeden/v1/config
  │                 └── vráti { apiBaseUrl, features } z WP nastavení pluginu
  │
  └── HTTPS → api.dvadsatjeden.org (Docker na tomto serveri)
        └── Express API, port 3021, cez Traefik reverse proxy
              ├── GET  /v1/events         – zoznam udalostí
              ├── POST /v1/rsvp           – anonymné RSVP
              ├── DELETE /v1/rsvp        – zrušenie RSVP
              ├── GET  /v1/rsvp/:id/counts
              ├── GET  /v1/rsvp/mine      – RSVP podľa tokenu (header X-Anonymous-Token)
              ├── POST /v1/import/run     – manuálny import (Bearer token)
              ├── GET  /v1/import/status  – stav importu
              └── GET  /health
```

---

## Backend API (`app/`)

**Runtime:** Node.js 20 + TypeScript, spúšťaný cez `tsx` priamo zo zdrojáku.

**Docker:** `docker compose up --build` v `/opt/community-api`.  
Traefik ho exposuje cez network `passbolt_default` (alias `traefik_proxy`).

**Dáta:**
- RSVP hlasy: `./data/rsvp-votes.json` (mountnuté ako volume)
- Stav importu: `./data/import-status.json` (mountnuté ako volume)
- Eventy: in-memory cache, lazy-load pri prvom requeste, refresh každých 30 min

**Env premenné** (`.env`):
```
PORT=3021
EVENTS_SOURCE_URL=https://prevadzky.dvadsatjeden.org/wp-json/dvadsatjeden-events/v1/list?country=sk
RSVP_PERSIST_PATH=/app/data/rsvp-votes.json
IMPORT_STATUS_PATH=/app/data/import-status.json
IMPORT_INTERVAL_MINUTES=30
CORS_ORIGIN=https://www.dvadsatjeden.org
IMPORT_SECRET=change-me-in-production   ← TREBA ZMENIŤ
NODE_ENV=production
```

**Rebuild a reštart API:**
```bash
cd /opt/community-api
docker compose up --build -d
docker compose logs -f community-api
```

---

## Frontend PWA (`community-web/`)

**Stack:** React 19, Vite 7, Evolu (local-first SQLite + sync), BIP-39 seed pre anonymnú identitu.

**Build:**
```bash
cd /opt/community-api/community-web
npm install        # ak chýba node_modules
npm run build:wp   # TypeScript check + Vite build + postbuild wasm alias
```

**Výstup buildu** ide do:
```
/opt/community-api/wp-content/plugins/dvadsatjeden-community/assets/
```

Vite config (`vite.config.ts`) má pevnú cestu `../../wp-content/plugins/dvadsatjeden-community/assets`.

Súbory ktoré build generuje/aktualizuje:
- `community-app.js` — hlavný React bundle
- `community-app.css` — štýly
- `community-app.js.map` — source map
- `Db.worker-*.js` + `.wasm` súbory — Evolu SQLite worker (menia sa len pri update @evolu)

---

## WordPress plugin (`wp-content/plugins/dvadsatjeden-community/`)

**Verzia:** 0.3.0

**Čo plugin robí:**
- Shortcode `[dvadsatjeden_community_app]` — renderuje React PWA (vloží `<div id="dvadsatjeden-community-app">` + načíta assets)
- Shortcode `[dvadsatjeden_remote_calendar]` — FullCalendar s eventami cez WP REST proxy
- REST endpoint `/wp-json/dvadsatjeden/v1/config` — vráti `apiBaseUrl` a feature flags pre React app
- REST endpoint `/wp-json/dvadsatjeden/v1/import-run` — spustí import na API (len pre admina)
- Assets loading: `DVC_COMMUNITY_URL . 'assets/community-app.js'` — URL sa odvodzuje od `plugins_url()` s opravou schémy pre HTTPS proxy

**Nastavenia pluginu v WP admin:** Settings → Dvadsatjeden Community  
Dôležité: `api_base_url` = `https://api.dvadsatjeden.org`

---

## Deployment flow — ako dostať zmeny na produkciu

### Backend (API)

```bash
cd /opt/community-api
docker compose up --build -d
```

Zmeny sú live okamžite po reštarte kontajnera.

### Frontend + WP plugin

**Krok 1 — build:**
```bash
cd /opt/community-api/community-web
npm run build:wp
```

**Krok 1b — bumper verziu** (ak sa menili PHP súbory alebo assets):  
Zmeniť verziu v `dvadsatjeden-community.php` (Plugin Name header + `DVC_COMMUNITY_VERSION` konštanta).

**Krok 2 — zbaliť ZIP:**
```bash
# DÔLEŽITÉ: spúšťaj z plugins/ adresára, nie z koreňa repozitára
# WP vyžaduje plugin adresár priamo v koreni ZIPu
# Najprv zmaž starý ZIP ak existuje — zip inak appenduje do existujúceho súboru!
cd /opt/community-api/wp-content/plugins
rm -f /opt/community-api/dvadsatjeden-community-X.Y.Z.zip
zip -r /opt/community-api/dvadsatjeden-community-X.Y.Z.zip dvadsatjeden-community/ \
  --exclude "*/assets/*.map"
```
(Existujúce ZIPy sú v `/opt/community-api/`.)

**Krok 3 — nahrať na WP:**  
WP Admin → Plugins → Add New → Upload Plugin → vyber ZIP → Install → Activate (alebo Update).

**Alternatíva — len assets:**  
Ak sa menil iba JS/CSS (nie PHP), stačí cez FTP/SSH prekopírovať iba:
- `assets/community-app.js`
- `assets/community-app.css`

do adresára pluginu na WP hostingu.

---

## Časté problémy

### Vidím starú verziu v prehliadači
1. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) alebo `Cmd+Shift+R` (Mac)
2. Skontroluj WP cache plugin (napr. WP Rocket, LiteSpeed Cache) — purge cache
3. Skontroluj že na WP hostingu je nahraná nová verzia súborov

### Zmeny v `app/` sa neprejavia
- Musíš rebuildiť Docker: `docker compose up --build -d`
- `dist/` je kompilovaný output, ale kontajner beží zo zdrojáku cez `tsx` — stačí reštart

### Build zlyhá na TypeScript
```bash
cd /opt/community-api/community-web
node_modules/.bin/tsc --noEmit    # ukáže TS chyby bez buildu
```

### `/opt/wp-content/` adresár
Tento adresár na tomto serveri obsahuje **iba assets/** bez PHP súborov — nie je to live WP.  
Live WP je na externom hostingu. Ignoruj `/opt/wp-content/` pri deploymente.

---

## Kľúčové súbory

```
/opt/community-api/
├── app/
│   ├── src/index.ts                    ← Express server, routes, middleware
│   ├── src/modules/events/             ← Event cache + fetch
│   ├── src/modules/rsvp/               ← RSVP logic + persistence
│   ├── src/modules/import/             ← Import status + trigger
│   ├── data/rsvp-votes.json            ← Persisted RSVP (volume mount)
│   ├── data/import-status.json         ← Persisted import status (volume mount)
│   └── Dockerfile
├── community-web/
│   ├── src/app/App.tsx                 ← Hlavná React app
│   ├── src/app/community-app.css       ← Všetky štýly (prefix dvc/dvcModal atď.)
│   ├── src/app/bootstrap.tsx           ← React root mount
│   ├── src/app/evolu/                  ← Evolu setup, schema, queries
│   ├── src/features/account/           ← BIP-39 seed / account derivation
│   └── vite.config.ts                  ← Build config, output path
├── wp-content/plugins/dvadsatjeden-community/
│   ├── dvadsatjeden-community.php      ← Plugin entry, verzia tu
│   ├── includes/Assets.php             ← Načítavanie JS/CSS do WP
│   ├── includes/Settings.php           ← WP options (api_base_url atď.)
│   ├── includes/ApiProxy.php           ← WP REST proxy + /config endpoint
│   ├── includes/Shortcode.php          ← [dvadsatjeden_community_app] + kalendár
│   └── assets/                         ← ← Build output tu (Vite)
├── docker-compose.yml
├── .env                                ← Secrets — IMPORT_SECRET treba zmeniť!
└── docs/
    ├── API_CONTRACTS.md
    ├── SEED_ACCOUNT_FLOW.md
    └── ROLLOUT_PHASES.md
```
