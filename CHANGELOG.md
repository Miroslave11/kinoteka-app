# Změny

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
