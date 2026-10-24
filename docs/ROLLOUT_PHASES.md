# Stav a ďalší rozvoj

## Realizované upratanie

- Jeden samostatný frontend build a Docker obraz; app plugin je archivovaný.
- Oddelený, pravidelne obnovovaný API zdroj komunít s odstráneniami, stabilnými ID, uchovaním posledných úspešných údajov a stavom synchronizácie.
- SQLite s verziou schémy, transakciami, cudzími kľúčmi, zálohou a overením obnovy; jednorazový import pôvodných JSON dát.
- Server je zdroj pravdy pre RSVP, Evolu a jeho duplicitná synchronizácia sú odstránené.
- Validácia vstupov a odkazov, limity zápisov, povinná ochrana administrácie, obmedzenie push destinácií a odstránenie ľubovoľného URL importu.
- Nostr účty obnoviteľné rovnakými 12 slovami; prihlásenie bez vkladania nsec; lokálna záloha overovaná tromi slovami.
- Opravené spracovanie miestnych časov zdroja vrátane letného času a zoskupenia cez hranice mesiacov.
- Hashované JS/CSS, správna cache HTML/SW/verzie, aplikačný obal dostupný offline, priame odkazy na udalosti.
- Testy API kontraktov, synchronizácie a obnovy; CI kontroluje aj produkčné buildy.
- Zachované rozpracované úpravy nápadov/projektov vrátane odkazov a archivácie.

## Externý WordPress

Deaktivácia starého app pluginu závisí od nasadenia samostatného dátového exportéra alebo od získania iného kompatibilného API komunít. Kým sa to nestane, živý zdroj musí zostať na pôvodnom endpointe. Postup je v OPERATIONS.md. Zmeny v tomto repozitári samy externý WP neupravia.

## Ďalšie produktové kroky

Po stabilizácii nasadenia a spätnej väzbe komunity:

1. Kalendárový export a odoberateľný kalendár, stabilné verejné detaily udalostí a nápadov.
2. Push preferencie podľa mesta/kategórie a pripomienky pred podujatím; dnes sa posielajú nové udalosti.
3. Pohodlné moderátorské rozhranie a nahlasovanie obsahu; dnes sú k dispozícii chránené API operácie.
4. Audit mobilnej prístupnosti, klávesnice a práce s modalmi; ďalšie rozdelenie veľkého App.tsx.
5. Integrácia obchodníkov len s konkrétnym priebežne aktualizovaným zdrojom.

Tieto rozšírenia nie sú podmienkou odstránenia WP app pluginu a nie sú vydávané za dokončené funkcie.
