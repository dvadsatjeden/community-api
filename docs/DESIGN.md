# Rozhranie Dvadsatjeden

Aktuálny návrh používa čiernu, bitcoinovú oranžovú a vecné slovenské texty. Svetlý editoriálny návrh 1.1.0 bol používateľom odmietnutý; nie je cieľovým vizuálnym smerom.

## Vizuálny systém

- Čierne pozadie a oddelené tmavé plochy s jemnými hranami.
- Bitcoinová oranžová pre hlavné akcie a aktívnu navigáciu; zelená iba pre úspešné stavy.
- Systémové sans písmo pre obsah, monospace pre dátumy a metadáta. Bez externého fontového CDN.
- Kompaktná typografia, malé polomery rohov, jasný kontrast a čitateľné disabled/error stavy.
- Pôvodný bielo-oranžový wordmark Dvadsatjeden v bočnej navigácii a mobilnej hlavičke. SVG je uložené lokálne v `community-web/src/app/logos/logo-dvadsatjeden.svg`; zdrojom je pôvodné [Logo-Mensie.svg](https://www.dvadsatjeden.org/wp-content/uploads/2023/09/Logo-Mensie.svg).
- Vlastná geometrická značka `21` v ikone aplikácie. Hlavná WordPress stránka ani jej logo sa tým nemenia.

## Rozloženie a texty

Úvod stručne vysvetľuje účel aplikácie: bitcoin udalosti, lokálne komunity a spoločné projekty na Slovensku a v Česku. Obsahuje najbližšie udalosti a odkazy na hlavné funkcie. Stavový panel zobrazuje iba skutočné údaje aplikácie: počet komunít, budúcich udalostí a stav lokálneho účtu. Čas aktualizácie sa vzťahuje výslovne na zoznam komunít, nie na bitcoin sieť.

Nezobrazujeme vymyslené on-chain ukazovatele, falošné online počty ani všeobecné slogany. Navigácia a nadpisy priamo pomenúvajú obsah: kalendár udalostí, mapa komunít, nápady a projekty, účet a nastavenia.

Desktop používa bočnú navigáciu; mobil zachováva päť hlavných sekcií v spodnej lište. Kalendár má podrobný a dátumový pohľad. Mapa, formuláre, modaly, účet a Nostr používajú rovnaký tmavý systém.

## Zachovanie funkcií

Redizajn nemení API ani identitu existujúcich účtov. Zachováva filtrovanie, RSVP, obnovu zo slov, Nostr NIP-07/NIP-46, mapové vrstvy a polohu, priebežné načítanie komunít, nápady, komentáre, hlasy, archiváciu, články, nástroje aj upozornenia. Výsledok sa overuje buildom, testami a izolovanými prehliadačovými scenármi na mobile aj desktope.

## Vývoj a vydanie

Zmeny idú cez novú vetvu, commit, push a PR. Pred mergom musí prejsť CI a dokončené CodeRabbit review najnovšieho commitu. Preskočené review neznamená schválenie. Nasadenie nasleduje až po merge; postup je v CONTRIBUTING.md a AGENTS.md.

## Súbory

- `community-web/src/app/community-app.css`: vizuálny systém a responzivita.
- `community-web/src/features/layout/AppLayout.tsx`: značka, navigácia a názvy sekcií.
- `community-web/src/features/layout/AtlasHero.tsx`: prehľadový panel so skutočnými údajmi. Názov súboru je interný historický názov.
- `community-web/public/favicon.svg` a `scripts/generate-icons.mjs`: SVG a generované PNG ikony PWA.
