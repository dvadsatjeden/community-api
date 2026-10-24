# Prevádzka

## Konfigurácia

Node.js 24; produkcia používa zostavený JavaScript, nie `tsx`. Frontend aj API sa stavajú do samostatných Docker obrazov. `.env` sa nenačítava do frontendu a tajomstvá sa do obrazu nekopírujú.

Základ je `.env.example`. Vyplň silný `IMPORT_SECRET` (napr. `openssl rand -hex 32`), produkčné CORS originy a adresy zdrojov. `PUBLIC_API_BASE_URL` sa používa v API konfigurácii aj ako build argument frontendu; po zmene treba rebuildovať frontend. Pri lokálnom vývoji fungujú predvolené localhost adresy.

`TRUST_PROXY=loopback,linklocal,uniquelocal` je určené pre aktuálne zapojenie: API nemá publikovaný hostiteľský port a prijíma požiadavky cez súkromný Traefik. Pri zmene topológie zúž dôveryhodné rozsahy na konkrétnu proxy. Nedávaj `true`.

Úložisko je `DATABASE_PATH=/app/data/sqlite/community.sqlite`, bind mount `./data:/app/data`. API beží ako používateľ `node` (UID 1000). Pred prvým nasadením priprav `data/sqlite` a `data/backups` s právami na zápis pre UID 1000. Staré JSON súbory ponechaj čitateľné pre jednorazový import.

## Prvý prechod z pôvodnej aplikácie

1. Zálohuj zdrojový strom, `.env`, staré `data/` a aktuálne obrazy. Neukladaj tajomstvá do Gitu.
2. V externom WordPresse nahraj `integrations/wordpress/community-source.php` do `wp-content/mu-plugins/community-source.php`. Samotný `community-map` a jeho údaje zostávajú zdrojom.
3. Over nový `https://www.dvadsatjeden.org/wp-json/community-map/v1/communities`: musí vrátiť aktuálny zoznam a pridať/odstrániť komunity podľa zdroja. Chýbajúci dátový súbor musí byť chyba, nie prázdny úspech.
4. Nastav `COMMUNITIES_SOURCE_URL` na tento endpoint a reštartuj API. Dovtedy môže zostať pôvodný `/wp-json/dvadsatjeden/v1/communities` — v tomto prípade starý plugin na WP ešte nevypínaj.
5. Nahraď shortcody `[dvadsatjeden_community_app]` a `[dvadsatjeden_remote_calendar]` odkazom/presmerovaním na PWA. Potom deaktivuj starý **Community app** plugin, nie obsahový `community-map`.
6. Over mapu, nový aj odstránený záznam, odkaz na komunitu a stav synchronizácie. Následne možno starý app plugin z externého WP odstrániť.

Nový malý exportér nemá JS/CSS, nastavenia, účet ani administračné operácie aplikácie. Je potrebný len preto, že súčasný obsahový zdroj iné API nemá. Ak dostaneš samostatné kompatibilné API, zmeň URL a môžeš odstrániť aj exportér.

Pri prvom štarte sa staré JSON RSVP, nápady, komentáre, hlasy, push odbery a geocoding importujú v jednej transakcii. Originály sa nemenia. Poškodený JSON zastaví štart; nikdy sa nenahradí tichým prázdnym úložiskom. Úspech sa označí v SQLite a import sa neopakuje. Staré import-status/push-notified súbory sa neprenášajú; prvý import udalostí vytvorí aktuálny stav. Existujúce push odbery môžu dostať súhrn aktuálnych budúcich udalostí. Produkcia zatiaľ nemá používateľov, takže sa zaviedlo nové úložisko lokálneho účtu v2 a opravené odvodzovanie Nostr účtu.

## Nasadenie

```bash
docker compose build
docker compose up -d --wait
docker compose ps
docker compose logs --tail 50 community-api
```

Over `/health`, `/v1/events`, `/v1/communities`, stav poslednej synchronizácie a načítanie PWA. Starý úspešný snapshot počas výpadku zdroja je zámerné správanie; `lastError` a `lastSuccessAt` ukazujú jeho aktuálnosť. Health endpoint potvrdzuje dostupnosť API/DB, nie aktuálnosť externých zdrojov.

Limity sú v pamäti jednej inštancie. Nastavenie viacerých replík zatiaľ nie je podporované. SQLite súbory patria na lokálny disk, nie na sieťový zdieľaný filesystem.

## Zálohovanie

```bash
./scripts/backup.sh
```

API navyše automaticky vytvára lokálnu zálohu pri štarte a každých 24 hodín (`BACKUP_INTERVAL_HOURS`). Uchová posledných 14 plánovaných kópií (`BACKUP_RETENTION`); manuálne zálohy nemaže. Adresár určuje `BACKUP_DIR`.

Skript použije SQLite online backup API a vytvorí `data/backups/community-<UTC>.sqlite`. Zálohy treba navyše pravidelne kopírovať mimo servera. Súčasťou zálohy konfigurácie musí byť `.env`, predovšetkým stabilný `NOSTR_AUTH_SECRET` a VAPID kľúče. Externý cieľ sa nenastavuje bez konkrétneho úložiska a prístupov. Lokálne zálohy samy nechránia pred stratou celého servera.

Samotné kopírovanie živého `.sqlite` nestačí: aktuálne údaje môžu byť vo WAL. Príkaz na zálohu nikdy neprepíše existujúci cieľ.

Overenie a obnova do nového súboru:

```bash
docker compose exec -T community-api node dist/scripts/restore.js /app/data/backups/NAZOV.sqlite /app/data/sqlite/restored.sqlite
```

Skript overí integritu, verziu schémy a cudzie kľúče. Potom zastav API, zmeň `DATABASE_PATH` na obnovený súbor a kontajner znovu vytvor. Nikdy neprepisuj databázu používanú bežiacim procesom. Pravidelne testuj aj načítanie konkrétnych údajov zo zálohy.

## Operátorské zásahy

`POST /v1/import/run`, `POST /v1/communities/sync`, test push a moderovanie obsahu sú chránené Bearer tajomstvom. Posielaj ho z bezpečného klienta, nie v URL. Mazanie nápadu odstráni súvisiace komentáre aj hlasy. Pred hromadnými zásahmi vytvor zálohu.

## Návrat verzie

Pred deployom označ aktuálne obrazy stabilnými rollback tagmi a uchovaj príslušný Compose/env súbor. Nové obrazy stavaj pred výmenou kontajnerov. Pri chybe nasadenia obnov staré obrazy a konfiguráciu, potom vytvor kontajnery znovu. SQLite migrácia má `user_version`; aplikácia odmietne novšiu neznámu schému. Pri budúcich zmenách schémy treba návrat databázy plánovať osobitne, nie iba prepnúť obraz.

Pri tejto migrácii pôvodná aplikácia naďalej vie používať nezmenené JSON súbory. Zápisy vykonané po prechode do SQLite by sa pri návrate k starej aplikácii nepreniesli; preto ich treba pred návratom exportovať alebo obnoviť vhodnú zálohu.
