# Účty, záloha a dôvera

## Lokálny účet

Prezeranie aplikácie nevyžaduje účet. Na požiadanie sa v prehliadači vytvorí 12 anglických BIP-39 slov (128 bitov entropie + checksum). Z normalizovaných slov sa odvodí:

- `ownerId = SHA256("owner:" + mnemonic)[0:32]`
- `rsvpToken = SHA256("rsvp:" + mnemonic)`

Slová lokálneho účtu sa na API neposielajú. Token je nositeľské oprávnenie: kto ho pozná, môže meniť príslušné RSVP a obsah. Na serveri sa ukladá jeho SHA-256 hash, nie token. Nejde o ochranu pred vytváraním viacerých identít jedným človekom.

Do potvrdenia zálohy aplikácia ukladá slová lokálne. Používateľ potvrdí uloženie mimo zariadenia a doplní tri náhodne vybrané slová. Po úspešnom potvrdení sa slová odstránia z uloženého účtu aj pamäte stavu účtu; token zostáva, aby sa nemusel prihlasovať pri každej návšteve. Aplikácia nemôže zaručiť vymazanie všetkých kópií z pamäte prehliadača, schránky či operačného systému.

Účet má verziované úložisko `d21.account.v2` a záložnú kópiu v IndexedDB. Záloha v IndexedDB nie je samostatnou zárukou proti vymazaniu údajov prehliadača. Lokálne tokeny ani čakajúce slová nie sú šifrované samostatným používateľským heslom.

## Obnova

Zadané slová sa validujú proti BIP-39 checksumu. Odvodia sa tie isté údaje, slová sa po obnove neukladajú a API vráti RSVP. Vlastníctvo nápadov a komentárov používa rovnaký token. Stratené slová lokálneho účtu nemá kto obnoviť.

## Nostr — odlišný model dôvery

Podpis sa vytvára cez NIP-07 rozšírenie alebo NIP-46 podpisovač; aplikácia nežiada vloženie `nsec`. Server vydá jednorazovú výzvu, overí podpis a čas a spotrebuje výzvu s päťminútovým TTL.

Z kombinácie stabilného `NOSTR_AUTH_SECRET` a overeného verejného kľúča server deterministicky odvodí BIP-39 slová účtu. Z nich odvodí **rovnakým postupom ako prehliadač** aj `ownerId` a `rsvpToken`. Účet tak obnoví opätovné Nostr prihlásenie aj jeho 12 slov.

Server tieto slová pozná a vie ich znovu odvodiť. Nostr prihlásenie preto neposkytuje rovnaký model súkromia ako lokálne vytvorený účet. Zmena serverového tajomstva zmení účty vydané cez Nostr; pôvodné uložené slová naďalej obnovia pôvodný účet. Tajomstvo musí byť bezpečne zálohované.

Výzvy a poverenia majú `Cache-Control: no-store`. Redis je voliteľný pre zdieľanie výziev, nie všeobecné škálovanie aplikácie.

## Ukladanie a offline režim

RSVP, nápady, komentáre a hlasy sú na serveri v SQLite. Nejde o end-to-end šifrované údaje. Evolu a jeho duplicitná synchronizácia boli odstránené. UI ukáže nový RSVP až po úspešnej odpovedi API; výpadok oznámi a umožní opakovanie. Server spracuje opakované nastavenie rovnakého hlasu bez jeho prepnutia späť.
