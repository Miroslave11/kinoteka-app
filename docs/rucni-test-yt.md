# Ruční test – YT videa (Y0–Y4)

Spusť Kinotéku (`Spustit Kinoteku.bat`) z větve `main` po začlenění PR #59, #60 a #61
(nebo z větve `yt-y4-sprava`, která obsahuje všechno).

## Y0 – menu

1. Deník je v levém menu úplně dole (pod Nastavením) a otevírá se.
2. Nad Nastavením je nová položka **YT videa** s počtem videí.

## Y1 – složka a řazení do kategorií

1. Nastavení → **YT videa**: složka `C:\Mirek_data\09_Videa\YT`. V Průzkumníku (tlačítko
   Otevřít) jsou podsložky Města, Příroda, Koncerty a živě, Hudební klipy, Ostatní.
2. Zkopíruj do kořene složky YT 2–3 videa, která mají v názvu ID z YouTube (`… [xxxxxxxxxxx].webm`),
   např. ze složky `09_Videa\YouTube`. Klikni **Proskenovat**.
   - Nejdřív jsou v „Čeká na zařazení“, za chvíli (údaje se dotahují z YouTube) se přesunou
     do kategorií – u rozhovorů a návodů čekej Ostatní, u hudby Hudební klipy / Města / Příroda.
   - Vedle videa vznikne `.info.json`.
3. Do Příroda přidej klíčové slovo, které sedí na další video, vlož ho do kořene a proskenuj →
   skončí v Příroda.
4. Přidej kategorii „Pláže“ → v Průzkumníku je nová podsložka.

## Y2 – stránka a přehrávání

1. **YT videa** v menu: nahoře počet videí a kategorií, štítky kategorií, řady po kategoriích
   (nejnovější první), náhled, délka.
2. Klik na štítek kategorie → mřížka jen té kategorie; „Vše“ vrátí řady. „Zobrazit vše“ u řady
   dělá totéž.
3. Pusť delší video (přes minutu), po chvíli zavři (×). Na stránce je řada **Pokračovat** s
   průběhem; další spuštění pokračuje od místa.
4. V přehrávači tlačítka předchozí / další přepínají videa ve stejné kategorii.
5. ■ Zastavit → video zmizí z Pokračovat (příště od začátku). Video dokoukané do konce má zelenou
   fajfku. Do **Deníku** se nic nezapisuje.

## Y3 – stahování z odkazu

1. Na stránce YT videa **Stáhnout z YouTube**, vlož odkaz na hudební klip, **Načíst** → náhled.
2. Kategorie **Automaticky** (výchozí) → po stažení se video zařadí podle štítků a popisu.
   Druhé video stáhni s ručně vybranou kategorií → uloží se rovnou do ní.
3. Kvalita 720p / 1080p / 4K – volba se pamatuje. U 4K jde o VP9 (na slabším PC se nemusí
   přehrávat plynule).
4. Odkaz na playlist → „Celý playlist (N)“, videa jdou do fronty postupně; × zruší stahované
   video (rozpracované soubory se smažou).
5. Vlož znovu odkaz na už stažené video → upozornění „Tohle video už máš“.
6. Neplatný odkaz → tlačítko Načíst nejde stisknout; odkaz na smazané video → srozumitelná chyba.

## Y4 – správa

1. Pravé tlačítko na videu (nebo ⋯ vlevo nahoře na kartě): Přehrát, **Přesunout do** jiné
   kategorie (soubor se přesune i s obrázkem a údaji, rozkoukání zůstane), **Otevřít na YouTube**,
   **Smazat do Koše** (na druhé kliknutí) → video je v Koši Windows.
2. Nastavení → YT videa: **Přejmenovat** kategorii → přejmenuje se i podsložka, videa zůstanou.
3. **Smazat** kategorii (na druhé kliknutí) → podsložka zmizí, její videa se znovu zařadí do
   ostatních kategorií. Hudební klipy a Ostatní smazat nejde (jde je jen přejmenovat).
4. Během stahování do kategorie ji nejde přejmenovat ani smazat (hláška).
