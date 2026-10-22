# Rozsah V1 – Přehrávač filmů (domácí kino ve stylu Plex)

Schváleno: 2026-10-22

## Rozhodnutí

| Téma                | Rozhodnutí                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platforma           | Windows 10/11, instalátor `.exe`                                                                                                                       |
| Technologie         | Electron + React + TypeScript, přehrávání přes přibalené **mpv**                                                                                       |
| Ovládání            | PC, myš + klávesnice (klávesové zkratky)                                                                                                               |
| Zvuk                | HDMI do AV receiveru/soundbaru → **bitstream passthrough** (AC3, E-AC3, DTS, DTS-HD MA, TrueHD/Atmos); záložní režim vícekanálové PCM                  |
| Metadata            | **ČSFD** (český popis, hodnocení %) + **TMDB** (HD plakáty, pozadí, logo názvu, data dílů seriálů, trailer) – TMDB vyžaduje vlastní bezplatný API klíč |
| Hodnocení uživatele | 1–5 hvězd                                                                                                                                              |
| Mazání              | lokální disk → Koš; NAS → trvale s potvrzením (doporučeno zapnout Koš na sdílené složce Synology)                                                      |
| UI jazyk            | čeština                                                                                                                                                |

## V1 musí umět

1. **Knihovna** – více zdrojových složek (lokální disk i SMB sdílení Synology), ruční + periodický inkrementální sken, formáty mkv/mp4/avi/m4v/ts; nedostupné soubory (vypnutý NAS) zůstanou v databázi označené.
2. **Seriály** – rozpoznání dílů z názvu souboru i v **ploché složce smíchané s filmy** (`S01E02`, `1x02`, `Díl 3`…), normalizace názvů (diakritika, štítky typu `CZ Dabing`, `HD`, `WEBRip`), sloučení variant názvu stejného seriálu, ruční oprava zařazení. Bez lokální AI.
3. **Prostorový zvuk** – passthrough přes HDMI, volitelně PCM 5.1/7.1.
4. **Pokračování** – ukládání pozice, „Pokračovat / Od začátku“, >90 % = zhlédnuto, řada „Pokračovat ve sledování“, „Další díl“.
5. **Metadata z ČSFD + TMDB** – název CZ/originál, rok, žánry, země, délka, režie, herci, popis, hodnocení ČSFD, plakát, pozadí; ruční „Opravit shodu“.
6. **Vlastnosti souboru** – kontejner, velikost, délka, rozlišení, kodek, HDR, fps, bitrate, zvukové a titulkové stopy (kodek, kanály, jazyk).
7. **Titulky** – vložené i externí (`.srt/.ass/.sub`), ruční načtení, styl (velikost, barva, obrys, pozadí, pozice), posun časování, automatická detekce kódování (CP1250/UTF-8).
8. **Výběr stop** – zvuk i titulky za běhu, preferované jazyky, zapamatování volby.
9. **Mazání** – s potvrzením, včetně přidružených titulků, i celé série.
10. **Deník zhlédnutých** – historie (kdy, kolikrát), hodnocení 1–5, poznámka, ruční „viděl jsem“, filtr.

**Design:** tmavé téma ve stylu Plex, dynamické barvy z plakátu, na pozadí krátké tiché klipy vyříznuté z vlastního souboru (ffmpeg), HD pozadí z TMDB, vyhledávání, řazení, filtry.

## Mimo V1

Streamování na jiná zařízení / server, vzdálený přístup, transkódování, mobilní a TV aplikace · více profilů · hudba, fotky, živá TV · lokální AI · stahování titulků z internetu · Synology DSM API, Wake-on-LAN · přejmenovávání souborů · Skip intro, DVD/Blu-ray menu, 3D · synchronizace s účtem ČSFD · macOS/Linux, automatické aktualizace, podepisování · TV/ovladačové UI.
