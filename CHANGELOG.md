# Změny

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
