# Sdílení mezi počítači přes Google Disk (schváleno 2026-11-08)

## Cíl

Kinotéka na více počítačích (doma i mimo domácí síť, někdy současně) má stejný **deník**
a stejnou knihovnu **YT videí** – odkazy, kategorie a klíčová slova. Synchronizace přes
**Google Disk**, přihlášení přímo v Kinotéce (bez dalšího programu).

## Co se sdílí

| Data                                                       | Sdílí se | Poznámka                                                        |
| ---------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| Deník – záznamy zhlédnutí, datum, poznámka, smazání        | ano      | titul podle TMDB ID (jinak název + rok), díl podle S/E          |
| Hodnocení titulů (hvězdičky)                               | ano      |                                                                 |
| YT kategorie – název, klíčová slova, přejmenování, smazání | ano      |                                                                 |
| YT online videa – odkaz, název, kanál, délka, kategorie    | ano      | na druhém PC vznikne `.ytonline` + náhled ve stejné kategorii   |
| YT stažená videa (s ID z YouTube)                          | ano      | na druhém PC se objeví jako **online** (soubor se nekopíruje)   |
| Přesun / smazání YT videa                                  | ano      | smazání na jednom PC smaže i na druhém (stažený soubor do Koše) |
| Rozkoukání a „zhlédnuto“ u YT videí                        | ne       | zůstává na každém PC zvlášť                                     |
| Složka s YT videi, filmy, nastavení přehrávání             | ne       | každé PC má vlastní cesty                                       |

## Jak to funguje

- **Přihlášení:** Nastavení → Sdílení → „Přihlásit se ke Google“ otevře prohlížeč, po
  souhlasu se Kinotéka vrátí (OAuth pro aplikace v počítači, PKCE, návrat na 127.0.0.1).
  Oprávnění jen ke **skryté složce aplikace** na Google Disku (`drive.appdata`) – Kinotéka
  nevidí žádné jiné soubory. Přihlášení se uloží zašifrované (Windows, `safeStorage`).
- **Data na Disku:** každé PC zapisuje jen **svůj** soubor změn (`zarizeni-<id>.json`)
  a čte soubory ostatních – dva počítače nikdy nepřepisují tentýž soubor, takže souběžné
  používání nevadí.
- **Změny:** každá změna (nový záznam deníku, nové online video, přesun…) má vlastní ID
  a čas. Při rozporu (stejný záznam upravený na obou PC) vyhraje novější změna.
  Smazání se pamatuje, aby se smazaná věc znovu „nevrátila“.
- **Kdy:** po spuštění, 10 s po každé změně a každých 5 minut; tlačítko „Synchronizovat teď“.
  Bez internetu se změny nasbírají a odešlou později.
- **První synchronizace:** obě PC nahrají vše, co už mají; deníky se sloučí (stejný titul
  a den = jeden záznam).

## Co musíš udělat ty (jednou, ~10 minut)

Kinotéka potřebuje vlastní „klientský klíč“ od Googlu. Projít s tebou krok za krokem:

1. console.cloud.google.com → nový projekt „Kinoteka“.
2. Zapnout **Google Drive API**.
3. Obrazovka souhlasu OAuth: typ **Externí**, název Kinotéka, tvůj e-mail; oprávnění
   `drive.appdata`; stav **V produkci** (v režimu Testování by přihlášení vypršelo
   každých 7 dní). Ověření Googlem pro toto oprávnění není potřeba.
4. Přihlašovací údaje → **ID klienta OAuth**, typ **Aplikace pro počítač**.
5. ID klienta a tajný klíč uložit jako secrets repozitáře (`KINOTEKA_GOOGLE_CLIENT_ID`,
   `KINOTEKA_GOOGLE_CLIENT_SECRET`) – vloží se do aplikace při sestavení, stejně jako klíč
   pro aktualizace. (U aplikací v počítači Google tajný klíč za tajný nepovažuje.)

## Postup (přírůstky, po každém ruční test)

| Krok | Obsah                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0   | Ty: klíč Google (výše). Já: návod, falešný server Google Disku pro testy.                                                                                              |
| S1   | Přihlášení Google, Nastavení → Sdílení (stav, název PC, Synchronizovat teď, Odhlásit), jádro synchronizace (soubory změn, ID, novější vyhrává). **Deník + hodnocení.** |
| S2   | **YT videa:** kategorie (název, klíčová slova, přejmenování, smazání), online videa (přidání, přesun, smazání), stažená videa jako online na druhém PC.                |
| S3   | Odolnost: bez internetu, zrušené přihlášení, první sloučení dvou existujících deníků, souhrnný ruční test na dvou PC, vydání 1.5.0.                                    |

## Rizika

- Titul, který na druhém PC v knihovně není, se v deníku ukáže jako „není v knihovně“
  (stejně jako dnes u smazaných filmů).
- Kdyby Google oprávnění v budoucnu přeřadil mezi „citlivá“, bylo by nutné ověření aplikace.
