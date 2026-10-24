# Nasadenie 1.0.0 — 23. 10. 2026

Nasadené na `https://app.dvadsatjeden.org` a `https://api.dvadsatjeden.org` cez Docker Compose. Oba kontajnery po nasadení prešli healthcheckom.

## Overené

- API: 115 testov, frontend: 6 testov; oba TypeScript a produkčné buildy úspešné.
- Závislosti aktualizované cez kompatibilné opravy; npm audit pri zostavení hlásil 0 známych zraniteľností v oboch balíkoch.
- PHP exportér: syntax overená cez PHP 8.3.
- Izolovaný test v mobilnom prehliadači: prezeranie bez účtu, vytvorenie účtu, RSVP, neúspešný zápis bez straty potvrdeného stavu, reload, potvrdenie zálohy tromi slovami, vymazanie lokálneho účtu, obnova, mapa, nápady a priamy odkaz na udalosť.
- Živá PWA: verzia 1.0.0, 59 komunít, 8 budúcich udalostí, 235 importovaných udalostí celkovo. Bez runtime chýb pri kontrolovanom prechode a pri offline načítaní aplikačného obalu.
- SQLite: migrácia zachovala 27 RSVP hlasov a 2 nápady; `integrity_check=ok`.
- Vytvorená a skúšobne obnovená záloha `data/backups/community-verified-20261023.sqlite`; potvrdených 27 RSVP a snapshot 59 komunít.
- Metadáta verzie na živej doméne majú `Cache-Control: no-store`. JS/CSS majú hashované názvy.

Počty záznamov zachytávajú okamih overenia, nie nemenné očakávania aplikácie.

## Zálohy pred zmenou

Zdrojový strom, pôvodná konfigurácia a pôvodné JSON dáta sú uložené v `data/migration-20261023/` s obmedzenými právami. Starý API obraz má tag `community-api-community-api:before-standalone-20261023`. Starý adresár `standalone-dist/` zostal zachovaný pre prípad návratu pôvodného Nginx nasadenia. Tieto lokálne zálohy treba podľa prevádzkových potrieb preniesť mimo servera.

## Zostávajúci zásah na externom WP

Aktuálna produkčná konfigurácia **zámerne ponecháva**:

`COMMUNITIES_SOURCE_URL=https://www.dvadsatjeden.org/wp-json/dvadsatjeden/v1/communities`

Z tohto API sa komunity priebežne obnovujú každých 15 minút; export nie je statický zoznam. Starý app plugin preto na externom WP ešte musí zostať aktívny.

Na dokončenie jeho vyradenia:

1. Nahrať `integrations/wordpress/community-source.php` do `wp-content/mu-plugins/community-source.php` na externom WP hostingu.
2. Overiť `/wp-json/community-map/v1/communities`, zmeniť `COMMUNITIES_SOURCE_URL` na tento endpoint a znova vytvoriť API kontajner (`docker compose up -d --force-recreate community-api`).
3. Overiť nový stav synchronizácie a nahradiť staré shortcody odkazom na PWA.
4. Deaktivovať/odstrániť pôvodný Community app plugin. Obsahový `community-map` sa neodstraňuje.

Externý WP nebol v tejto relácii dostupný na správu; jeho súbory ani nastavenia sa nemenili. Podrobný postup a nezávislá API alternatíva sú v OPERATIONS.md.
