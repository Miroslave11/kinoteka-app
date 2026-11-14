# Kinotéka

Domácí kino ve stylu Plex pro filmy a seriály uložené na lokálním disku nebo na Synology NAS.
Windows 10/11 · Electron + React + TypeScript · přehrávání přes mpv.

- Rozsah V1: [SCOPE.md](SCOPE.md)
- Implementační plán: [PLAN.md](PLAN.md)
- Mockupy obrazovek: [docs/mockupy/index.html](docs/mockupy/index.html)

## Instalace

Instalátor `Kinoteka-Setup-<verze>.exe` je ke stažení ve
[vydáních](https://github.com/Miroslave11/kinoteka-app/releases/latest). Vzniká v CI (artefakt
„Kinoteka-Setup“ u každého běhu GitHub Actions) nebo lokálně příkazem `npm run dist` do `dist/`. Obsahuje mpv i ffmpeg.
Instalátor není podepsaný, Windows SmartScreen proto při prvním spuštění zobrazí varování
(„Další informace“ → „Přesto spustit“). Knihovna, deník a nastavení jsou v `%APPDATA%\kinoteka`
(stejná složka jako při vývoji, takže se po instalaci zachovají) a odinstalace je nemaže.

Nainstalovaná Kinotéka se sama aktualizuje z vydání v tomto veřejném repozitáři – bez
přihlášení a bez klíče.

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
   [vydání tohoto repozitáře](https://github.com/Miroslave11/kinoteka-app/releases). Stačí mu
   vestavěný `GITHUB_TOKEN`.
3. Koncept zkontrolovat a zveřejnit – teprve potom si ho nainstalované Kinotéky stáhnou
   (po spuštění a každých 6 hodin) a nainstalují při zavření.

Workflow potřebuje tajné proměnné (Settings → Secrets and variables → Actions)
`KINOTEKA_GOOGLE_CLIENT_ID` a `KINOTEKA_GOOGLE_CLIENT_SECRET` (klient Google typu „Aplikace pro
počítač“ pro sdílení přes Google Disk).

**Přechod ze soukromého repozitáře:** Kinotéky do verze 1.6.0 hledají aktualizace jen v
soukromém `kinoteka-vydani` (klíčem vloženým v aplikaci). Dokud existuje secret
`KINOTEKA_VYDANI_TOKEN`, workflow nahraje stejný koncept i tam – zveřejnit je potřeba oba.
Až budou všechny počítače na novější verzi, smazat přechodový krok ve workflow, secrety
`KINOTEKA_VYDANI_TOKEN` a `KINOTEKA_UPDATE_TOKEN`, oba klíče na GitHubu a repozitář
`kinoteka-vydani`.

Aktualizace jdou vyzkoušet i ve vývoji proti vlastnímu serveru se souborem `latest.yml`:
`KINOTEKA_DEV_UPDATE_URL=http://127.0.0.1:8767/ npm run dev`.
