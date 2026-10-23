# Kinotéka

Domácí kino ve stylu Plex pro filmy a seriály uložené na lokálním disku nebo na Synology NAS.
Windows 10/11 · Electron + React + TypeScript · přehrávání přes mpv.

- Rozsah V1: [SCOPE.md](SCOPE.md)
- Implementační plán: [PLAN.md](PLAN.md)
- Mockupy obrazovek: [docs/mockupy/index.html](docs/mockupy/index.html)

## Instalace

Instalátor `Kinoteka-Setup-<verze>.exe` vzniká v CI (artefakt „Kinoteka-Setup“ u každého běhu
GitHub Actions) nebo lokálně příkazem `npm run dist` do složky `dist/`. Obsahuje mpv i ffmpeg.
Instalátor není podepsaný, Windows SmartScreen proto při prvním spuštění zobrazí varování
(„Další informace“ → „Přesto spustit“). Knihovna, deník a nastavení jsou v `%APPDATA%\kinoteka`
(stejná složka jako při vývoji, takže se po instalaci zachovají) a odinstalace je nemaže.

## Spuštění bez instalace

Dvojklik na `Spustit Kinoteku.bat` ve složce projektu. Při prvním spuštění doinstaluje
závislosti a stáhne mpv a ffmpeg. Okno příkazového řádku nech otevřené – jeho zavřením se
aplikace ukončí.

## Vývoj

Požadavky: Node.js 24, npm.

```bash
npm install
npm run fetch:bin
npm run dev
```

| Příkaz              | Co dělá                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`       | spustí aplikaci s automatickým reloadem                                               |
| `npm run build`     | sestaví aplikaci do `out/`                                                            |
| `npm run dist`      | sestaví instalátor do `dist/` (stáhne mpv a ffmpeg, pokud chybí)                      |
| `npm run lint`      | ESLint                                                                                |
| `npm run typecheck` | kontrola typů TypeScriptu                                                             |
| `npm test`          | automatické testy (Vitest)                                                            |
| `npm run format`    | naformátuje kód Prettierem                                                            |
| `npm run fetch:bin` | jednou stáhne mpv a ffmpeg (pevné verze, ověřené kontrolní součty) do `resources/bin` |

CI (GitHub Actions, Windows) při každém pushi spustí lint, kontrolu formátu, typů, testy a build
a sestaví instalátor.
