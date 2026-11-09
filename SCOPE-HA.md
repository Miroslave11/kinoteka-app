# Ovládání Home Assistant z Kinotéky (návrh, čeká na schválení)

## Cíl

Kinotéka ovládá entitu v Home Assistant na domácí síti – zatím **`switch.vypinac_linka`** –
**ručně** (tlačítko) i **automaticky podle přehrávání** (spuštění, pauza, konec).
Platí pro **Filmy, Seriály a YT videa**, **ne pro Děti**.

## Připojení

- Adresa: výchozí **`http://homeassistant.local:8123`** (ověřeno: odpovídá z tohoto PC,
  192.168.0.127). Jde zadat i IP adresu, kdyby `.local` na jiném PC nefungovalo.
- Přihlášení: **dlouhodobý přístupový token** z HA (Profil → Zabezpečení → Dlouhodobé
  přístupové tokeny → „Kinotéka“). Uloží se zašifrovaně (Windows, `safeStorage`), stejně jako
  přihlášení ke Google. **Nesdílí se** přes Google Disk – každé PC si ho zadá zvlášť.
- Komunikace z hlavního procesu (renderer token nikdy nevidí): REST
  `POST /api/services/<doména>/turn_on|turn_off|toggle` a WebSocket API
  (`subscribe_entities`) pro živý stav tlačítka. Časový limit 3 s.
- **Nikdy neblokuje přehrávání:** když HA neodpovídá, film se spustí normálně a jen se ukáže
  krátká nenápadná hláška „Home Assistant nedostupný“ (jednou, ne při každé pauze).

## Nastavení → Home Assistant (nová karta)

| Položka               | Popis                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Zapnuto               | hlavní vypínač celé funkce                                                                     |
| Adresa, Token         | + tlačítko **Ověřit spojení** (ukáže verzi HA a název domova, nebo srozumitelnou chybu)        |
| Ovládaná entita       | výběr ze seznamu entit z HA s hledáním (switch, light, scene, script…); výchozí `vypinac_linka` |
| Zobrazovaný název     | např. „Linka“ – v bublině u žárovky a v hláškách (výchozí = friendly_name z HA)                  |
| Automatika            | zapnout/vypnout + pravidla níže + zaškrtnutí Filmy / Seriály / YT videa                         |

### Pravidla automatiky (výchozí hodnoty)

| Událost                                   | Akce (nic / zapnout / vypnout / vrátit původní) | Výchozí            |
| ----------------------------------------- | ----------------------------------------------- | ------------------ |
| Spuštění přehrávání                       |                                                 | **vypnout**        |
| Pauza                                     |                                                 | **zapnout**        |
| Pokračování po pauze                      |                                                 | **vypnout**        |
| Konec / zavření přehrávače / ■ Zastavit   |                                                 | **vrátit původní** |

- „Vrátit původní“ = stav entity před spuštěním filmu (když byla linka zhasnutá už předtím,
  po filmu se nerozsvítí).
- Pauza kratší než **2 s** se ignoruje (přetáčení, omylem stisknutá mezera).
- Přechod na další díl seriálu = žádná akce (nezhasíná/nerozsvěcí mezi díly).
- Když entitu mezitím někdo přepne ručně (vypínač na zdi, aplikace HA), Kinotéka to respektuje
  a „vrátit původní“ na konci už neprovede.

## Ruční ovládání

- **Horní lišta** (vedle ikony celé obrazovky): **jen ikona žárovky bez textu**, barevně
  podle živého stavu (svítí žlutě / zhasnuto šedě / nedostupné čárkovaně), klik = přepnout.
  Název entity jen v bublině po najetí myší („Linka – L“).
- **Přehrávač** (Filmy, Seriály, YT): stejná ikona žárovky v ovládací liště vpravo.
  Při přepnutí krátká hláška „Linka: zapnuto“. V dětském přehrávači není.
- **Klávesa L** = přepnout žárovku – v přehrávači i v hlavním okně (ne při psaní do pole
  pro text). **Pozor:** L dnes v přehrávači znamená „+10 s“ (dvojice s J = −10 s). Nově:
  +10 s jen šipkou →, J (−10 s) a ← zůstávají; nápověda klávesových zkratek se upraví.

## Postup (přírůstky, po každém ruční test)

| Krok | Obsah                                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H0   | Ty: vytvořit token v HA. Já: falešný HA server pro testy (`scripts/fake-ha.mjs`, REST + WebSocket), aby se při vývoji neblikalo skutečnou linkou.                             |
| H1   | Připojení (`src/main/ha/`), Nastavení → Home Assistant (adresa, token, ověření, výběr entity, název), **ruční ovládání** (žárovka) v horní liště a v přehrávači + klávesa L, živý stav.|
| H2   | **Automatika** podle přehrávání – pravidla, výběr částí, „vrátit původní“, ignorování krátkých pauz a přechodů mezi díly, hláška při nedostupnosti.                            |
| H3   | Odolnost (výpadek HA/sítě, neplatný token, smazaná entita, opětovné připojení WebSocketu), `docs/rucni-test-ha.md`, souhrnný ruční test, vydání **1.6.0** jen se souhlasem.    |

## Mimo rozsah (případně později)

- Víc entit najednou / scény podle typu obsahu (film vs. YT) – návrh je připravený tak, aby šlo
  rozšířit na seznam entit.
- Stmívání světel na procenta (u `switch` nedává smysl).
- Ovládání Kinotéky z Home Assistant (opačný směr).

## Rizika

- `homeassistant.local` (mDNS) nemusí na každém PC/síti fungovat → ověření spojení poradí
  zadat IP adresu.
- Token má plná práva k HA – proto je uložený zašifrovaně a Kinotéka volá jen služby pro
  vybranou entitu.
