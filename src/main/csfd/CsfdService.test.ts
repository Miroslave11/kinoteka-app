import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TitleMetadata } from '../../shared/metadata'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase, type Database } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import { CsfdService } from './CsfdService'

const fixture = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8')
const PAGES: Record<string, string> = {
  '117181': fixture('drz-hubu.html'),
  '1680696': fixture('ukryt-nebo-past.html')
}
/** TMDB ID → ID z ČSFD, jak by je vrátila Wikidata. */
const WIKIDATA: Record<string, string> = { '7229': '117181', '1284041': '1680696' }

let db: Database
let catalog: CatalogRepository
let settings: SettingsRepository

function addMovie(file: string, tmdbId?: number): number {
  db.prepare(
    `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at)
     VALUES (1, ?, ?, 1, 1, '', '')`
  ).run(`C:\\F\\${file}`, file)
  catalog.rebuild()
  const movie = catalog.listMovies().find((m) => m.files.some((f) => f.fileName === file))!
  if (tmdbId) catalog.saveMetadata(movie.id, { tmdbId } as TitleMetadata, 'matched')
  return movie.id
}

/** Falešný internet: Wikidata a stránky ČSFD. */
function fakeFetch(status: Record<string, number> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.hostname === 'wd.test') {
      const ids = [...url.searchParams.get('query')!.matchAll(/"(\d+)"/g)].map((m) => m[1]!)
      const bindings = ids
        .filter((id) => WIKIDATA[id])
        .map((id) => ({ tmdb: { value: id }, csfd: { value: WIKIDATA[id] } }))
      return new Response(JSON.stringify({ results: { bindings } }))
    }
    const id = /\/film\/(\d+)\//.exec(url.pathname)?.[1] ?? ''
    if (status[id]) return new Response('', { status: status[id] })
    return PAGES[id] ? new Response(PAGES[id]) : new Response('', { status: 404 })
  })
}

function service(
  fetch: ReturnType<typeof fakeFetch>,
  sleep = vi.fn(async () => undefined)
): CsfdService {
  return new CsfdService(catalog, settings, {
    fetch,
    baseUrl: 'http://csfd.test',
    wikidataUrl: 'http://wd.test/sparql',
    delayMs: 5000,
    sleep
  })
}

beforeEach(() => {
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\F', 'F', 'local', '')"
  ).run()
  catalog = new CatalogRepository(db)
  settings = new SettingsRepository(db)
})

describe('CsfdService', () => {
  it('ID zjistí přes Wikidata, načte stránky a mezi nimi dělá pauzu', async () => {
    addMovie('Drž hubu! (2003).mkv', 7229)
    addMovie('Úkryt nebo past (2026) cz dabing.mkv', 1284041)
    addMovie('Neznámý film (2026).mkv', 555)
    addMovie('Bez TMDB.mkv')
    const fetch = fakeFetch()
    const sleep = vi.fn(async () => undefined)

    await service(fetch, sleep).run()

    const byName = Object.fromEntries(catalog.listMovies().map((m) => [m.name, m]))
    expect(byName['Drž hubu']).toMatchObject({
      csfdStatus: 'linked',
      csfd: { id: 117181, rating: 84 }
    })
    expect(byName['Úkryt nebo past']).toMatchObject({ csfdStatus: 'linked', csfd: { rating: 52 } })
    expect(byName['Neznámý film']).toMatchObject({ csfdStatus: 'notfound', csfd: null })
    expect(byName['Bez TMDB']).toMatchObject({ csfdStatus: 'pending', csfd: null })

    // Na ČSFD nikdy nevyhledává, jen stránky filmů; dvě stránky = jedna pauza.
    const csfdUrls = fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('csfd.test'))
    expect(csfdUrls).toEqual([
      'http://csfd.test/film/117181/prehled/',
      'http://csfd.test/film/1680696/prehled/'
    ])
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('načtené stránky do 30 dní znovu nestahuje', async () => {
    addMovie('Drž hubu! (2003).mkv', 7229)
    const fetch = fakeFetch()
    await service(fetch).run()
    await service(fetch).run()
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('csfd.test'))).toHaveLength(1)
  })

  it('ruční propojení odkazem; špatný odkaz odmítne', async () => {
    const id = addMovie('Neznámý film (2026).mkv', 555)
    const csfd = service(fakeFetch())
    await csfd.run()
    expect(await csfd.link(id, 'https://www.themoviedb.org/movie/1')).toMatchObject({ ok: false })
    expect(await csfd.link(id, 'https://www.csfd.cz/film/117181-drz-hubu/prehled/')).toEqual({
      ok: true
    })
    await csfd.run()
    expect(catalog.listMovies()[0]).toMatchObject({ csfdStatus: 'manual', csfd: { id: 117181 } })
  })

  it('při HTTP 429 přestane načítat další stránky', async () => {
    addMovie('Drž hubu! (2003).mkv', 7229)
    addMovie('Úkryt nebo past (2026) cz dabing.mkv', 1284041)
    const fetch = fakeFetch({ '117181': 429 })
    await service(fetch).run()
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('csfd.test'))).toHaveLength(1)
    expect(catalog.listMovies().find((m) => m.name === 'Drž hubu')).toMatchObject({
      csfdStatus: 'error'
    })
  })

  it('vypnuté ČSFD nic nestahuje', async () => {
    addMovie('Drž hubu! (2003).mkv', 7229)
    const fetch = fakeFetch()
    const csfd = service(fetch)
    csfd.setEnabled(false)
    await csfd.run()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('nová shoda na TMDB zruší staré propojení s ČSFD', async () => {
    const id = addMovie('Drž hubu! (2003).mkv', 7229)
    await service(fakeFetch()).run()
    catalog.saveMetadata(id, { tmdbId: 1284041 } as TitleMetadata, 'manual')
    expect(catalog.listMovies()[0]).toMatchObject({ csfdStatus: 'pending', csfd: null })
  })
})
