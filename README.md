# Kinotéka

Domácí kino ve stylu Plex pro filmy a seriály uložené na lokálním disku nebo na Synology NAS.
Windows 10/11 · Electron + React + TypeScript · přehrávání přes mpv.

- Rozsah V1: [SCOPE.md](SCOPE.md)
- Implementační plán: [PLAN.md](PLAN.md)
- Mockupy obrazovek: [docs/mockupy/index.html](docs/mockupy/index.html)

## Vývoj

Požadavky: Node.js 24, npm.

```bash
npm install
npm run dev
```

| Příkaz              | Co dělá                                 |
| ------------------- | --------------------------------------- |
| `npm run dev`       | spustí aplikaci s automatickým reloadem |
| `npm run build`     | sestaví aplikaci do `out/`              |
| `npm run lint`      | ESLint                                  |
| `npm run typecheck` | kontrola typů TypeScriptu               |
| `npm test`          | automatické testy (Vitest)              |
| `npm run format`    | naformátuje kód Prettierem              |

CI (GitHub Actions, Windows) při každém pushi spustí lint, kontrolu formátu, typů, testy a build.
