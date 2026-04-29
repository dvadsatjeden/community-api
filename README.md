# dvadsatjeden.org — komunitná aplikácia

Monorepozitár komunitnej platformy pre slovensko-českú Bitcoin komunitu [dvadsatjeden.org](https://dvadsatjeden.org). Obsahuje backend API, React PWA a WordPress plugin.

> Licencia: **MIT** — kód je slobodne použiteľný, upraviteľný a šíriteľný.

---

## Čo to je

Webová progresívna aplikácia (PWA) zabudovaná do WordPress stránky dvadsatjeden.org. Slúži ako komunitný hub — agreguje Bitcoin eventy na Slovensku a v Česku, zobrazuje miesta kde možno platiť bitcoinom, a umožňuje členom sledovať komunity a RSVP na eventy, všetko anonymne bez registrácie.

---

## Funkcie

### Eventy
- Zoznam nadchádzajúcich Bitcoin eventov (meetupy, konferencie, Bitcoin Pivo stretnutia)
- Filtrovanie podľa krajiny, regiónu a kategórie
- Badges: kategória eventu, **Vstup voľný** (zelený) ak je vstup zadarmo
- Tlačidlo **Kúpiť vstupenku** pri platených eventoch s linkom na predaj
- Detail eventu v modali: popis, miesto, čas, obrázok, RSVP

### RSVP (anonymné)
- Tri stavy: **Zúčastním sa / Možno / Zrušiť**
- Identita je odvodená z BIP-39 seed phrase (12 slov) — žiadna registrácia, žiadny email
- RSVP počty sú viditeľné pre všetkých
- Sync cez [Evolu](https://evolu.dev) (lokálna SQLite + šifrovaný P2P sync)

### Anonymný účet (BIP-39 seed)
- Účet = 12 náhodných slov (BIP-39 mnemonic)
- Seed sa ukladá len v prehliadači (nikdy sa neposiela na server)
- Exportovateľný, importovateľný — funguje na viacerých zariadeniach

### Mapa
- Interaktívna Leaflet mapa s dvoma vrstvami:
  - **Oranžové** markery — eventy s dátumom a miestom
  - **Modré** markery — Signal skupiny komunít
- Tlačidlo **Moja poloha** — geolokácia, priblíženie mapy, otvorenie najbližšej komunity
- Legenda vrstiev
- Obchodníci (pripravené, čoskoro)

### Komunity (Signal skupiny)
- Mapa lokálnych komunít s markerom a logom
- Modal komunity: logo, názov, mesto, nadchádzajúce akcie v danom meste
- Tlačidlo **Otvoriť Signal skupinu** — presmeruje cez rate-limitovaný proxy endpoint (URL nie je v JS kóde)

### Kalendár
- Zoskupenie eventov podľa mesiacov
- Zobrazenie dňa, dátumu, času, kategórie, miesta
- Badge **Vstup voľný** v riadku eventu
- Tlačidlo **+ Pridať** — odkaz na formulár pre pridanie nového eventu

### Nástroje (Úvod)
- Prehľad Bitcoin nástrojov: Mempool.space, BTCPay Server, BTC Map, Hydranode, SATFLUX, DCA Bot, Vekslák, CBDC Tracker
- Sekcia „Ako to funguje" — vysvetlenie anonymného účtu a RSVP

### Web push notifikácie
- Voliteľné push notifikácie o nových eventoch (VAPID)
- Subscribe/unsubscribe bez registrácie

### PWA
- Inštalovateľná ako aplikácia na mobile aj desktopu
- Service worker, offline fallback

---

## Architektúra

```
Prehliadač
  ├── www.dvadsatjeden.org (WordPress, externý hosting)
  │     └── WP plugin shortcode → načíta React PWA bundle
  └── app.dvadsatjeden.org (standalone PWA, Nginx + Docker)

api.dvadsatjeden.org (Express API, Docker, tento server)
  ├── GET  /v1/events              — zoznam eventov (s geocodingom)
  ├── GET  /v1/venues              — miesta na mape
  ├── GET  /v1/communities         — komunity (bez URL)
  ├── GET  /v1/communities/:id/join — presmerovanie na Signal (rate-limited)
  ├── GET  /v1/articles            — proxy WP článkov
  ├── POST /v1/rsvp                — RSVP hlas
  ├── GET  /v1/rsvp/mine           — moje RSVP (podľa anon tokenu)
  ├── POST /v1/push/subscribe      — Web Push subscribe
  └── POST /v1/import/run          — manuálny import eventov (Bearer)
```

### Komponenty

| Adresár | Obsah |
|---|---|
| `app/` | Node.js / Express / TypeScript REST API |
| `community-web/` | React 19 PWA (Vite build) |
| `wp-content/plugins/dvadsatjeden-community/` | WordPress plugin (PHP) |

---

## Lokálny vývoj

### API
```bash
cd app
npm install
cp ../.env.example ../.env   # nastav EVENTS_SOURCE_URL, IMPORT_SECRET
npm run dev
```

### Frontend
```bash
cd community-web
npm install
npm run dev          # standalone dev server
npm run build:wp     # build do WP plugin assets
```

### Testy
```bash
cd app && npm test          # 62 testov (Vitest)
cd community-web && npm test # 6 testov (Vitest)
```

---

## Deployment

### Backend
```bash
cd /opt/community-api
docker compose up --build -d
```

### Frontend + WP plugin
```bash
cd community-web && npm run build:wp

# Zbaliť ZIP pre WP upload
cd ../wp-content/plugins
rm -f /opt/community-api/dvadsatjeden-community-X.Y.Z.zip
zip -r /opt/community-api/dvadsatjeden-community-X.Y.Z.zip dvadsatjeden-community/ \
  --exclude "*/assets/*.map"
```

Potom nahrať ZIP cez **WP Admin → Plugins → Add New → Upload Plugin**.

Podrobnosti v [`CLAUDE.md`](./CLAUDE.md).

---

## Prispieť — hľadáme dobrovoľníkov

Projekt je open-source (MIT) a vítame pomoc od komunity. Ak ti nie je ľahostajné ako vyzerá Bitcoin komunita na Slovensku a v Česku, môžeš prispieť:

- **Frontend (React/TypeScript)** — nové funkcie, UX vylepšenia, preklady
- **Backend (Node.js/Express)** — nové API endpointy, optimalizácie
- **WordPress (PHP)** — vylepšenia pluginu, integrácie
- **Dizajn** — ikony, ilustrácie, animácie
- **Obsah** — popis komunít, kategórie eventov, texty
- **Testovanie** — hlásenie bugov, návrhy zlepšení

Otvor **Issue** alebo **Pull Request** na GitHube. Otázky a diskusia v Signal skupinách komunít.

---

## Licencia

MIT © dvadsatjeden.org

Slobodne použi, uprav a zdieľaj. Ak postavíš niečo na tomto kóde pre svoju Bitcoin komunitu, daj vedieť.
