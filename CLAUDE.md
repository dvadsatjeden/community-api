# Pokyny pre prácu na repozitári

Aktuálna architektúra a príkazy sú v README.md a docs/OPERATIONS.md. Tento súbor už neopisuje historický deployment cez WP ZIP.

- Produkčný frontend je samostatná PWA. Predvolený `npm run build` v `community-web/` generuje `dist/` a nikdy nezapisuje do WordPressu.
- Backend používa Node.js 24 a `node:sqlite`. Relatívne TypeScript importy majú `.js` príponu kvôli produkčnému ESM buildu.
- SQLite je zdrojom pravdy pre RSVP a obsah. Nenavracaj Evolu ani paralelnú lokálnu databázu hlasov.
- Komunity sa získavajú priebežne z `COMMUNITIES_SOURCE_URL`. Rozlišuj chybu zdroja od úspešného prázdneho zoznamu. Zachovaj posledný úspešný snapshot a stabilné ID nezávislé od poradia.
- Existujúce rozpracované zmeny používateľa zachovaj. Nesiahaj na `.env` ani dáta bez konkrétneho dôvodu; tajomstvá nevypisuj.
- Zmeny over cez `npm test` a `npm run build` v oboch balíkoch. HTTP testy potrebujú lokálny testovací port.
- Starý plugin v `archive/` je archív. Na externom WP sa automaticky nemení. Pred jeho deaktiváciou treba nainštalovať dátový API exportér a overiť živý zdroj.
- Zálohovanie používa SQLite backup API. Nekopíruj samotný živý `.sqlite` súbor bez WAL.
