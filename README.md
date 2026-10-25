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

Nainstalovaná Kinotéka se sama aktualizuje ze soukromého repozitáře
[kinoteka-vydani](https://github.com/Miroslave11/kinoteka-vydani), kde jsou jen instalátory.
Čte ho klíčem jen pro čtení, který je vložený v aplikaci (viz níže).

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

## Vydání a automatické aktualizace

1. Zvýšit verzi v `package.json` a doplnit `CHANGELOG.md`, začlenit do `main`.
2. Tag `v<verze>` (např. `git tag v1.2.0 && git push origin v1.2.0`) spustí workflow
   „Vydání“: sestaví instalátor a nahraje ho s `latest.yml` jako **koncept** vydání do
   [kinoteka-vydani](https://github.com/Miroslave11/kinoteka-vydani).
3. Koncept zkontrolovat a zveřejnit – teprve potom si ho nainstalované Kinotéky stáhnou
   (po spuštění a každých 6 hodin) a nainstalují při zavření.

Workflow potřebuje dvě tajné proměnné (Settings → Secrets and variables → Actions), obě jako
osobní klíč GitHubu (fine-grained) jen pro repozitář `kinoteka-vydani`:

- `KINOTEKA_VYDANI_TOKEN` – _Contents: Read and write_, nahrává vydání. Když vyprší, stačí ho
  vyměnit – nainstalovaných aplikací se to netýká.
- `KINOTEKA_UPDATE_TOKEN` – jen _Contents: Read-only_, vloží se do aplikace a ta jím čte
  vydání. Bez něj workflow skončí chybou. Platnost ukazuje Nastavení → O aplikaci a 30 dní
  před vypršením i pruh nahoře. **Výměna:** nový klíč do secretu, vydat novou verzi a
  nainstalovat ji, dokud starý klíč platí. Po vypršení už Kinotéka novou verzi sama
  nenajde – instalátor je pak potřeba stáhnout z GitHubu ručně.

Aktualizace jdou vyzkoušet i ve vývoji proti vlastnímu serveru se souborem `latest.yml`:
`KINOTEKA_DEV_UPDATE_URL=http://127.0.0.1:8767/ npm run dev`.
