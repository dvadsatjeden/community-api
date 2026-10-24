# Dvadsatjeden — komunitná aplikácia

Samostatná React PWA pre Bitcoin komunity na Slovensku a v Česku. WordPress slúži na obsah a ako vymeniteľný zdroj údajov; aplikácia sa doň nevkladá.

- `community-web/`: React 19, Vite, Leaflet, inštalovateľná PWA.
- `app/`: Express 5 + TypeScript, Node.js 24, SQLite s transakciami a WAL.
- `integrations/wordpress/community-source.php`: voliteľný malý API exportér existujúcej mapy komunít.
- `archive/wordpress-plugin/`: pôvodný app plugin, mimo aktívneho buildu.

Produkcia: `app.dvadsatjeden.org` → `api.dvadsatjeden.org`. Docker Compose používa existujúci Traefik v sieti `passbolt_default`.

## Funkcie

Udalosti a kalendár, mapa komunít, anonymné RSVP, nápady/projekty a komentáre, voliteľné Nostr prihlásenie a push upozornenia. Účet vzniká z 12 slov bez emailu. Samotné prezeranie účet nevyžaduje.

RSVP a obsah sa ukladajú na serveri; Evolu bolo odstránené. Obnova pomocou rovnakých slov obnoví prístup aj na inom zariadení. Aplikácia potvrdí zmenu až po odpovedi API; offline zápisy neukladá do fronty. Offline je dostupný predtým načítaný aplikačný obal, nie kompletná mapa ani živé dáta.

## Komunity cez API

`COMMUNITIES_SOURCE_URL` určuje externý JSON endpoint. API ho obnovuje po štarte a každých 15 minút; otvorená PWA načítava aktuálny zoznam každú minútu a pri návrate do okna.

Úspešné načítanie **nahradí** zoznam: pribudnuté komunity sa pridajú, odstránené zmiznú. Výpadok, neplatný JSON alebo chybný záznam zachová posledný úspešný zoznam v SQLite aj po reštarte. Prázdne `items: []` znamená platný prázdny zoznam. API neodhadne zánik komunity samo — musí ho zohľadniť autoritatívny zdroj.

Formát, stabilné ID a stav synchronizácie opisuje [API kontrakt](docs/API_CONTRACTS.md). Zdroj môže byť akékoľvek kompatibilné API; nemusí to byť WordPress.

## Vývoj

Použi Node.js 24 (`nvm use`). Backend a frontend majú samostatné lockfiles.

```bash
cd app
npm ci
npm run dev
```

Lokálne API bez `.env` používa port 3021, SQLite v `app/data/`, verejné zdroje a vypnuté administrátorské operácie. Ak chceš načítať vlastný env súbor: `node --env-file=../.env --import tsx src/index.ts`; produkčné cesty `/app/data/...` si pri lokálnom vývoji nahraď lokálnymi.

V ďalšom termináli:

```bash
cd community-web
npm ci
npm run dev
```

PWA beží na `http://localhost:5173`, API na `http://localhost:3021`. Produkčnú adresu API možno zmeniť build premennou `VITE_API_BASE_URL`.

## Overenie

V oboch adresároch spusti `npm test` a `npm run build`. CI kontroluje testy, TypeScript, oba buildy a produkčné Docker obrazy. Testy používajú izolovanú databázu, nikdy produkčné súbory.

## Nasadenie a správa

Postup, konfigurácia, odpojenie starého WP pluginu, zálohy a návrat verzie sú v [prevádzkovom návode](docs/OPERATIONS.md).

```bash
docker compose build
docker compose up -d --wait
```

Frontend je súčasťou obrazu a neservuje rozpracovaný build z hostiteľského adresára. JS/CSS majú názvy odvodené od obsahu; HTML, service worker a metadáta verzie sa priebežne overujú zo siete.

Tajomstvá patria do `.env`, ktorý nie je vo verziovaní. Produkcia vyžaduje silný `IMPORT_SECRET`; bez neho sa nespustí. Nikdy nemeň `NOSTR_AUTH_SECRET` bez plánu obnovy účtov.

## Dokumentácia

- [API](docs/API_CONTRACTS.md)
- [Účty a dôvera](docs/SEED_ACCOUNT_FLOW.md)
- [Prevádzka a zálohy](docs/OPERATIONS.md)
- [Záznam nasadenia 1.0.0](docs/DEPLOYMENT_2026-10-23.md)
- [Dokončené zmeny a ďalší rozvoj](docs/ROLLOUT_PHASES.md)
- [Vizuálna identita aplikácie](docs/DESIGN.md)
- [Vývoj, PR a CodeRabbit](docs/CONTRIBUTING.md)

Projekt je určený na jednu inštanciu API s lokálnou SQLite. Viac inštancií potrebuje samostatný návrh úložiska a distribuovaných limitov; samotné zapnutie Redis túto vlastnosť nemení.
