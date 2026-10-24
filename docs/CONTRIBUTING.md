# Vývoj a GitHub review

Používame krátke vetvy a pull requesty cez používateľov fork. `origin` smeruje na `webiumsk/community-api`, `upstream` na projektový repozitár `dvadsatjeden/community-api`. Pracovné vetvy pushujeme do `origin`. Parameter `-u` pri pushi nastavuje sledovanie vzdialenej vetvy a nesúvisí s názvom remote `upstream`. PR aj merge robí používateľ.

## Každá zmena

1. Spustiť `git fetch upstream` a vytvoriť novú vetvu (`feature/...`, `fix/...`) z aktuálneho `upstream/main`. Zachovať existujúce rozpracované súbory.
2. Pripraviť jednu ucelenú zmenu. V oboch balíkoch podľa rozsahu spustiť `npm test` a `npm run build` na Node.js 24.
3. Commitnúť zmenu a pushnúť vetvu cez `git push -u origin <vetva>`.
4. Používateľ otvorí PR z `webiumsk/community-api:<vetva>` do `dvadsatjeden/community-api:main` s popisom problému, výsledného správania a validácie. Agent PR nevytvára.
5. Počkať na CI aj CodeRabbit. Kontrola musí patriť k najnovšiemu commitu. Overiť komentáre a otvorené review vlákna, nie len zelenú ikonku.
6. Opraviť vecné pripomienky a opäť počkať na review. Ak odporúčanie nie je správne, vysvetliť dôvod vo vlákne; nevyriešené námietky nepovažovať automaticky za súhlas.
7. Používateľ mergne PR až po úspešnom CI a dokončenom review bez nevyriešených vecných pripomienok. Agent PR nemerguje. Po overení merge nasadiť a overiť živú verziu.

CodeRabbit môže dokončiť kontrolu bez inline pripomienok. Hľadaj potvrdenie „No actionable comments were generated“. Prázdny zoznam komentárov, preskočená kontrola alebo vyčerpaný limit samy osebe nepotvrdzujú úspešné review.

## Odporúčané nastavenie repozitára

Pre sólo projekt stačí `main` + krátke vetvy; ďalšie trvalé vetvy ako `develop` nie sú potrebné. Odporúčaný je squash merge, povinné úspešné kontroly a vyriešené diskusie. Povinné schválenie ďalším človekom netreba zavádzať, ak na projekte reálne pracuje jeden človek. Konkrétnu ochranu vetvy nastavuje správca GitHub repozitára; tento dokument ju sám neaktivuje.

Referencie: [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [CodeRabbit: dokončené review bez pripomienok](https://kb.coderabbit.ai/articles/1972528363-why-did-coderabbit-not-leave-any-review-comments-on-my-pull-request).

## Bezpečný obsah commitu

Do Gitu patria zdrojové súbory, testy, lockfiles, dokumentácia a `.env.example`. `.env`, runtime dáta, databázy, zálohy, build výstupy a ZIPy sa neposielajú na GitHub. Pred pushom skontroluj staged diff a zoznam súborov.
