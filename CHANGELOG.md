# Změny

## Nevydáno

### Veřejný repozitář

- Kinotéka je nově ve veřejném repozitáři [kinoteka-app](https://github.com/Miroslave11/kinoteka-app) – zdrojový kód i instalátory ke stažení.
- Automatické aktualizace se hledají tam, bez klíče. Zmizel údaj o platnosti klíče v Nastavení → O aplikaci a upozornění na jeho vypršení.

### Ovládání Home Assistant

- Po spuštění videa se světlo vypne až **2 s po rozehrání** (ne už při načítání); film zavřený do 2 s světlo nepřepne.
- Přepnutí žárovky v přehrávači už neukazuje hlášku „… zapnuto / vypnuto“ – stav ukazuje jen barva žárovky.

## 1.6.0 – 2026-11-09

### Ovládání Home Assistant

- Nová sekce **Nastavení → Home Assistant**: adresa (výchozí `http://homeassistant.local:8123`), dlouhodobý přístupový token (uložený zašifrovaně jen v tomto počítači, přes Google Disk se nesdílí), Ověřit spojení a výběr ovládané entity (vypínač, světlo, pomocník typu přepínač) s vlastním názvem.
- **Žárovka** vpravo nahoře a v ovládací liště přehrávače: žlutá = zapnuto, šedá = vypnuto, čárkovaná = Home Assistant nedostupný. Klik entitu přepne; stav je živý (změna vypínačem na zdi se hned projeví).
- **Klávesa L** přepne žárovku v hlavním okně i v přehrávači. V přehrávači se tím mění zkratka: posun o +10 s je teď jen na šipce →.
- **Automatika podle přehrávání** (Filmy, Seriály, YT videa; Děti nikdy): spuštění = vypnout, pauza delší než 2 s = zapnout, pokračování = vypnout, konec / zavření přehrávače = vrátit stav před spuštěním. Pravidla jdou změnit (nic / zapnout / vypnout / vrátit původní). Mezi díly seriálu se nic nepřepíná; když entitu během filmu přepneš ručně, Kinotéka ji na konci nechá být.
- **Odolnost:** výpadek Home Assistant nikdy nezastaví přehrávání (jen jedna hláška); spojení se po výpadku sítě i po probuzení počítače ze spánku obnoví samo. Neplatný token a smazaná entita mají srozumitelnou hlášku.

## 1.5.0 – 2026-11-08

### Sdílení mezi počítači přes Google Disk

- Nová sekce **Nastavení → Sdílení**: po přihlášení účtem Google sdílí Kinotéka data se všemi počítači přihlášenými ke stejnému účtu – doma i mimo domácí síť, i když běží na obou současně.
- Sdílí se **deník** (záznamy, datum, poznámka, smazání) a **hodnocení**. Film, který druhý počítač v knihovně nemá, je v jeho deníku jako „není v knihovně“. Stejné zhlédnutí zapsané na obou počítačích se při prvním propojení sloučí.
- Sdílí se **YT videa**: kategorie s klíčovými slovy a videa s odkazem na YouTube. Video stažené na jednom počítači se na ostatních objeví jako online; přesun do jiné kategorie i smazání se promítne všude. Rozkoukání zůstává na každém počítači zvlášť.
- Kinotéka má přístup jen ke své **skryté složce** na Google Disku – ostatní soubory nevidí. Synchronizuje po spuštění, chvíli po každé změně a každých 5 minut; bez internetu změny počkají.
- Zásady ochrany soukromí: https://miroslave11.github.io/kinoteka-web/soukromi.html

## 1.4.0 – 2026-11-08

### YT videa – online videa

- **Přidat jen odkazem:** video z YouTube jde přidat jako **online** (výchozí) – na disk se uloží jen odkaz a náhled, video se přehraje v běžném přehrávači přímo z YouTube (rozkoukání, předchozí / další, přetáčení). Kvalita přehrávání podle nastavení (výchozí 1080p).
- Každé video má štítek **V počítači** nebo **☁ Online**; podtitul stránky ukazuje, kolik místa zabírají stažená videa.
- **Převody:** „Ponechat jen online“ u staženého videa nebo celé kategorie uvolní místo (soubor jde do Koše, pozice a zhlédnutí zůstanou); „Stáhnout do počítače“ u online videa ho stáhne zpět.
- Online video, které YouTube už nevydá, dostane štítek **Nedostupné**.
- **Rychlý start:** adresy online videí si Kinotéka pamatuje i po zavření (video spuštěné v posledních hodinách se spustí hned) a připraví je předem, když najedeš myší na video.
- Po kliknutí na online video se ukáže **„Načítám video z YouTube…“** s kolečkem.
- Oprava: online video se po otevření hned zavřelo (YouTube čerstvou adresu první vteřiny odmítá – Kinotéka teď počká, až ji vydá).

### YT videa – vzhled

- Videa v kategoriích se zalamují pod sebe – stránku už není potřeba posouvat doprava.
- Výraznější nadpisy kategorií (větší písmo, oranžový proužek, počet videí).

### Přehrávač

- Při každém čekání (otevírání videa, další / předchozí díl, přetáčení, načítání dat ze sítě) se uprostřed obrazu ukáže kolečko s textem, co se děje.

### YT videa – stahování

- **Víc odkazů najednou:** každý odkaz na nový řádek, seznam se zaškrtnutím (videa, která už máš, jsou odškrtnutá), Přidat vybrané.
- **Souběžné stahování:** výchozí 2 videa najednou, v Nastavení → YT videa jde zvolit 1–3.
- **Fronta:** pozastavit vše / pokračovat, zkusit znovu chybné, zrušit vše. Nedokončená stahování **pokračují i po restartu** aplikace; zbytky přerušených stahování se při startu smažou.
- Video dostažené během procházení složky se zařadí do kategorie hned.

## 1.3.0 – 2026-11-07

### YT videa (nová část)

- Nová položka **YT videa** v levém menu: videa stažená z YouTube (hlavně klipy) ve vlastní složce, výchozí `C:\Mirek_data\09_Videa\YT`. Složka jde změnit v Nastavení → YT videa.
- **Řazení podle obsahu:** každá podsložka je jedna kategorie (výchozí Města, Příroda, Koncerty a živě, Hudební klipy, Ostatní). Videa vložená přímo do složky se zařadí podle štítků, názvu, popisu a kanálu z YouTube a přesunou se i s obrázkem a údaji. Videím bez údajů, která mají v názvu ID z YouTube, se údaje dotáhnou samy.
- **Kategorie a klíčová slova** jdou v Nastavení → YT videa upravit, přidat, přejmenovat i smazat (videa ze smazané kategorie se znovu zařadí).
- **Stránka YT videa:** řada Pokračovat, filtr kategorií, řady videí s náhledem, délkou a průběhem.
- **Přehrávání** v běžném přehrávači: rozkoukané video pokračuje, předchozí / další video v kategorii, Zastavit rozkoukání smaže. Do deníku se nic nezapisuje.
- **Stáhnout z YouTube:** odkaz na video nebo playlist, náhled, kategorie (automaticky podle obsahu nebo ručně), kvalita 720p / 1080p / 4K, fronta s průběhem.
- **Správa videí:** pravé tlačítko (nebo ⋯) na videu – přesunout do jiné kategorie, otevřít na YouTube, smazat do Koše.

### Menu

- Deník je teď poslední položkou levého menu (pod Nastavením).

## 1.2.2 – 2026-11-07

### Knihovny

- Klik na název knihovny v levém menu ji znovu proskenuje – po připojení odpojeného disku nebo Synology (stav „offline“) už není nutné chodit do Nastavení. Během skenu tečka pulzuje.

### Přehrávání

- Tlačítko „Další díl“ je teď vedle tlačítka Vpřed o 30 s a nově je vedle tlačítka Zpět o 10 s tlačítko „Předchozí díl“ (klávesa P).

## 1.2.1 – 2026-10-25

### Přehrávání

- Film spuštěný z celé obrazovky je hned opravdu na celé obrazovce i na vedlejším monitoru nebo projektoru – hlavní panel Windows už nezůstane vidět přes obraz.

### Aktualizace

- Kinotéka se umí aktualizovat i ze soukromého repozitáře s vydáními: má v sobě klíč, který smí vydání jen číst. Nastavení → O aplikaci ukazuje, do kdy klíč platí; 30 dní před vypršením upozorní i pruh nahoře.

## 1.2.0 – 2026-10-25

### Celá obrazovka

- Kinotéka jde přepnout na celou obrazovku – zmizí lišta okna i hlavní panel Windows. Přepíná se ikonou vpravo v horní liště nebo klávesou F11, Esc celou obrazovku opustí (když není otevřený dialog).
- Na celé obrazovce je vedle ikony tlačítko Ukončit. Kinotéka si poslední režim pamatuje a příště v něm nastartuje; po zavření filmu zůstane knihovna na celé obrazovce.

### Ústřední melodie

- Na stránce filmu nebo seriálu potichu zahraje jeho ústřední melodie: začne po chvilce, hraje jednou a zeslábne při odchodu ze stránky, spuštění filmu nebo minimalizaci okna.
- Melodie se stahují samy na pozadí: odkaz se najde v komunitní databázi ThemerrDB podle údajů z TMDB a z YouTube se stáhne jen zvuk ze začátku (asi 1 MB na titul). Otevřený titul jde na řadu přednostně.
- Odkaz „Melodie…“ v detailu: vlastní zvukový soubor, odkaz z YouTube, nebo bez melodie. Vlastní melodii jde uložit i vedle filmu jako `Název souboru filmu.theme.mp3` (u seriálu `theme.mp3` ve složce seriálu).
- Nastavení → Zvuk → Ústřední melodie: zapnutí, hlasitost (výchozí 25 %), automatické stahování a jeho stav.

## 1.1.2 – 2026-10-24

### Přehrávání

- Nové tlačítko ■ Zastavit v přehrávači: zavře film a zapomene, kde jste skončili, takže příště začne od začátku. Zápis v deníku zůstane. Křížek a Esc dál uloží pozici jako dosud.

### Děti

- Hlasitost v dětském přehrávači: velké tlačítko pro ztlumení a posuvník, na klávesnici šipky nahoru a dolů.
- Náhled odkazu z YouTube je hotový během chvilky i na pomalejším počítači. yt-dlp se připraví hned po otevření stahování a dlouhé čekání má časový limit.
- Nový náhled zruší ten předchozí a při zavření Kinotéky se ukončí i rozběhnuté stahování. Na pozadí tak nezůstávají běžet procesy yt-dlp, které zpomalovaly počítač.

## 1.1.1 – 2026-10-24

### Děti

- Kulaté obrázky titulů jsou z TMDB: ke každé pohádce se podle názvu složky (případně klíčových slov nebo kanálu videí) dohledá pořad a do kolečka se dá jeho obrázek s postavičkami, takže jde titul poznat na první pohled. Bez klíče TMDB nebo když se pořad nenajde, zůstane obrázek z dílu.
- Pro rodiče → Tituly: obrázek titulu jde vybrat z obrázků pořadu na TMDB, z dílů, nebo vlastní ze souboru. Řádek „Pořad na TMDB“ ukazuje, ke kterému pořadu titul patří; jiný pořad jde najít podle názvu nebo vložením odkazu z themoviedb.org (třeba Bing se najde jako „Bing bunny“), případně TMDB u titulu vypnout.

## 1.1.0 – 2026-10-24

Dětská část – pohádky pro děti s vlastním vzhledem, rodičovskou bránou a stahováním z YouTube. Rozsah: [SCOPE-DETI.md](SCOPE-DETI.md).

### Děti

- Vlastní složka s pohádkami (`C:\Mirek_data\09_Videa\Kids`), každá podsložka je jeden titul (třeba „Prasátko Peppa“). Videa vložená přímo do složky se podle údajů z YouTube sama zařadí do titulu i s obrázkem.
- Dětský vzhled: velké kulaté tituly, řady „Dívat se dál“, „Oblíbené“ a „Nové pohádky“, detail titulu a 5 motivů (Obloha, Louka, Moře, Vesmír, Jednorožci).
- Dětský přehrávač se zjednodušeným ovládáním: pokračování od uložené pozice, další pohádka automaticky, srdíčko pro oblíbené. Historie je oddělená od deníku dospělých.
- Rodičovská brána (PIN, bez něj příklad pro dospělé) chrání část Pro rodiče. Dětský režim přežije restart. Denní časový limit pohádek a volba spouštět Kinotéku rovnou v dětském režimu.
- Tlačítko „Odejít“ vrátí Kinotéku do dospělé části bez PINu. Volba „Odchod jen za branou“ ho skryje.
- Pro rodiče → Stáhnout z YouTube: náhled odkazu, návrh titulu, kvalita 1080p/720p, celý playlist (nejvýš 200 videí), fronta s průběhem a rušením. Nástroj yt-dlp se stáhne při prvním použití.
- Pro rodiče → Tituly: přejmenování titulu i složky, obrázek titulu, klíčová slova pro zařazení, přesun videa do jiného titulu a mazání do Koše.
- V menu je položka Děti s počtem pohádek.
- Celé nastavení dětské části je v hlavním Nastavení → Děti. Rodičovskou bránu tam jde úplně vypnout (dokud dítě neovládá počítač) – Pro rodiče, stahování i odchod pak fungují bez PINu.
- Stahování z YouTube zvládne i videa s dlouhým názvem (název souboru se zkrátí, aby cesta nepřekročila limit Windows).

### Knihovna

- Vzdělávací kurzy patří mezi seriály: názvy jako „Lekce 05 - Video 3 - …“ se rozpoznají samy (lekce = série, video = díl) a na TMDB se nedohledávají.
- Upravit zařazení → „Zařadit stejně celou složku“: všechny soubory ve složce se zařadí jako jeden seriál, díly podle pořadí názvů.

### Ostatní

- Automatické aktualizace: Kinotéka po spuštění a každých 6 hodin zkontroluje novou verzi, stáhne ji na pozadí a nainstaluje při zavření (nebo hned tlačítkem „Restartovat a nainstalovat“). Vypnout jde v Nastavení → O aplikaci. Vydání jsou ve veřejném repozitáři [kinoteka-vydani](https://github.com/Miroslave11/kinoteka-vydani).
- Nová ikona aplikace (filmový pás s tlačítkem přehrát).
- Kinotéka jde spustit jen jednou. Další spuštění přepne do otevřeného okna, dvě instance nad stejnými daty už nevzniknou.
- Na menších obrazovkách se řady pohádek neořezávají.

## 1.0.0 – 2026-10-24

První vydání Kinotéky – domácího kina pro Windows ve stylu Plex. Rozsah: [SCOPE.md](SCOPE.md).

### Knihovna

- Více zdrojových složek – lokální disk i síťové sdílení (Synology), ruční i automatický sken, který zpracuje jen změny. Nedostupná složka zůstane v knihovně označená, nic se nesmaže.
- Rozpoznání filmů a seriálů z názvů souborů i v jedné smíšené složce (`S01E02`, `1x02`, `Díl 3`…), očištění názvů od štítků (`CZ Dabing`, `WEBRip`…), sloučení různě pojmenovaných dílů jednoho seriálu, ruční oprava zařazení.
- Vlastnosti souboru přes ffprobe: rozlišení, HDR, kodeky, bitrate, zvukové a titulkové stopy.

### Údaje o filmech a seriálech

- TMDB (vlastní bezplatný klíč): český název a popis, plakáty, pozadí, loga, herci, režie, trailer, díly seriálů včetně těch, které na disku nejsou; ruční „Opravit shodu“ a „Znovu načíst údaje“.
- Hodnocení a počet hlasů z oficiálního datového souboru IMDb (stahuje se jednou týdně).
- Termíny dalších dílů a nových sérií běžících seriálů, stav „skončil / zrušen“, řada „Brzy vyjde“ na Domů; údaje se obnovují jednou denně.

### Přehrávání

- Přibalené mpv s ovládáním přes obraz, celá obrazovka, klávesové zkratky.
- Prostorový zvuk přes HDMI: passthrough AC3, E-AC3, DTS, DTS-HD MA, TrueHD/Atmos, nebo vícekanálové PCM; výběr zařízení a formátů.
- Pokračování od uložené pozice, „Pokračovat / Od začátku“, řada „Pokračovat ve sledování“, „Další díl“.
- Výběr zvukových stop a titulků za běhu, preferované jazyky, zapamatování volby.
- Titulky vložené i externí, automatická detekce kódování (CP1250/UTF-8), styl, posun časování, stahování titulků z OpenSubtitles.com (vlastní bezplatný klíč).

### Vzhled

- Tmavé téma ve stylu Plex, barvy podle plakátu, na pozadí krátké tiché klipy z vlastního souboru, HD pozadí z TMDB.
- Domů s řadami, mřížky filmů a seriálů, detail filmu a seriálu, vyhledávání (Ctrl+K), filtry a řazení.

### Deník a mazání

- Deník zhlédnutých: kdy a kolikrát, hodnocení 1–5 hvězd, poznámka, ruční „Viděl jsem“ (už zapsaný film se omylem nepřidá znovu), filtry a statistiky.
- Mazání filmu, dílu i celé série s potvrzením včetně titulků – z lokálního disku do Koše, ze sítě trvale s varováním. Deník zůstává.

### Instalace

- Instalátor `Kinoteka-Setup-1.0.0.exe` s přibaleným mpv a ffmpeg. Data aplikace jsou v `%APPDATA%\kinoteka`.

### Neověřeno v praxi

- HDMI passthrough se skutečným receiverem, knihovna na Synology přes SMB a skutečné API OpenSubtitles byly testované jen částečně (OpenSubtitles proti testovacímu serveru).
- Instalátor není podepsaný – Windows SmartScreen při prvním spuštění zobrazí varování („Další informace → Přesto spustit“).
