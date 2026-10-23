import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TitleMetadata } from '../../shared/metadata'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase, type Database } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import { ImdbService, readRatings } from './ImdbService'

/** Ukázka datového souboru IMDb ve stejném tvaru jako title.ratings.tsv.gz. */
const DATASET = gzipSync(
  [
    'tconst\taverageRating\tnumVotes',
    'tt0000001\t5.6\t2154',
    'tt0310203\t7.4\t37012',
    'tt32268156\t5.9\t48210',
    'tt9999999\t8.1\t12'
  ].join('\n') + '\n'
)

let dir: string
let db: Database
let catalog: CatalogRepository
let settings: SettingsRepository
let now: Date

function addMovie(file: string, imdbId: string | null): number {
  db.prepare(
    `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at)
     VALUES (1, ?, ?, 1, 1, '', '')`
  ).run(`C:\\F\\${file}`, file)
  catalog.rebuild()
  const movie = catalog.listMovies().find((m) => m.files.some((f) => f.fileName === file))!
  catalog.saveMetadata(movie.id, { tmdbId: movie.id, imdbId } as TitleMetadata, 'matched')
  return movie.id
}

function fakeFetch(etag = '"v1"') {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    if (headers['If-None-Match'] === etag) return new Response(null, { status: 304 })
    return new Response(DATASET, {
      headers: { ETag: etag, 'Last-Modified': 'Fri, 23 Oct 2026 00:48:50 GMT' }
    })
  })
}

const service = (fetch: ReturnType<typeof fakeFetch>): ImdbService =>
  new ImdbService(catalog, settings, {
    fetch,
    cacheDir: dir,
    url: 'http://imdb.test/r.tsv.gz',
    now: () => now
  })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kinoteka-imdb-'))
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\F', 'F', 'local', '')"
  ).run()
  catalog = new CatalogRepository(db)
  settings = new SettingsRepository(db)
  now = new Date('2026-10-23T08:00:00Z')
})

afterEach(() => rm(dir, { recursive: true, force: true }))

describe('readRatings', () => {
  it('vybere jen hledané tituly a přeskočí hlavičku', async () => {
    const file = join(dir, 'r.tsv.gz')
    await writeFile(file, DATASET)
    const ratings = await readRatings(file, new Set(['tt0310203', 'tt32268156', 'tt404']))
    expect([...ratings]).toEqual([
      ['tt0310203', { rating: 7.4, votes: 37012 }],
      ['tt32268156', { rating: 5.9, votes: 48210 }]
    ])
  })
})

describe('ImdbService', () => {
  it('stáhne datový soubor a doplní hodnocení titulům s IMDb ID', async () => {
    addMovie('Drž hubu (2003).mkv', 'tt0310203')
    addMovie('Úkryt nebo past (2026).mkv', 'tt32268156')
    addMovie('Nový film (2026).mkv', 'tt12345678')
    addMovie('Bez IMDb.mkv', null)
    const imdb = service(fakeFetch())

    await imdb.run()

    const byName = Object.fromEntries(catalog.listMovies().map((m) => [m.name, m.imdb]))
    expect(byName).toEqual({
      'Drž hubu': { id: 'tt0310203', rating: 7.4, votes: 37012 },
      'Úkryt nebo past': { id: 'tt32268156', rating: 5.9, votes: 48210 },
      'Nový film': null,
      'Bez IMDb': null
    })
    expect(imdb.status()).toMatchObject({
      enabled: true,
      titles: 3,
      rated: 2,
      error: null,
      datasetDate: '2026-10-23T00:48:50.000Z'
    })
  })

  it('do týdne znovu nestahuje; po týdnu se ptá podmíněně (HTTP 304)', async () => {
    addMovie('Drž hubu (2003).mkv', 'tt0310203')
    const fetch = fakeFetch()
    const imdb = service(fetch)
    await imdb.run()
    await imdb.run()
    expect(fetch).toHaveBeenCalledTimes(1)

    now = new Date('2026-11-01T08:00:00Z')
    await imdb.run()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect((fetch.mock.calls[1]![1]?.headers as Record<string, string>)['If-None-Match']).toBe(
      '"v1"'
    )
    expect(catalog.listMovies()[0]!.imdb?.rating).toBe(7.4)
  })

  it('nový titul dostane hodnocení z už staženého souboru bez nového stahování', async () => {
    addMovie('Drž hubu (2003).mkv', 'tt0310203')
    const fetch = fakeFetch()
    const imdb = service(fetch)
    await imdb.run()
    addMovie('Úkryt nebo past (2026).mkv', 'tt32268156')
    await imdb.run()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(catalog.listMovies().find((m) => m.name === 'Úkryt nebo past')?.imdb?.rating).toBe(5.9)
  })

  it('bez internetu ohlásí chybu a použije starší soubor', async () => {
    addMovie('Drž hubu (2003).mkv', 'tt0310203')
    await service(fakeFetch()).run()
    const offline = service(
      vi.fn(async () => {
        throw new Error('net::ERR_INTERNET_DISCONNECTED')
      }) as unknown as ReturnType<typeof fakeFetch>
    )
    await offline.updateNow()
    expect(offline.status().error).toContain('ERR_INTERNET_DISCONNECTED')
    expect(catalog.listMovies()[0]!.imdb?.rating).toBe(7.4)
  })

  it('vypnuté IMDb nic nestahuje', async () => {
    addMovie('Drž hubu (2003).mkv', 'tt0310203')
    const fetch = fakeFetch()
    const imdb = service(fetch)
    imdb.setEnabled(false)
    await imdb.run()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('nová shoda na TMDB zahodí staré hodnocení', async () => {
    const id = addMovie('Drž hubu (2003).mkv', 'tt0310203')
    await service(fakeFetch()).run()
    catalog.saveMetadata(id, { tmdbId: 999, imdbId: 'tt32268156' } as TitleMetadata, 'manual')
    expect(catalog.listMovies()[0]!.imdb).toBeNull()
  })
})

describe('ImdbService – souběh s TMDB', () => {
  it('titul, který IMDb ID dostane během čtení souboru, se doplní hned v dalším kole', async () => {
    addMovie('Drž hubu (2003).mkv', 'tt0310203')
    const late = addMovie('Úkryt nebo past (2026).mkv', null)
    const imdb = service(fakeFetch())
    // Během prvního čtení souboru přijde z TMDB IMDb ID druhého filmu.
    const original = catalog.saveImdbRatings.bind(catalog)
    let first = true
    vi.spyOn(catalog, 'saveImdbRatings').mockImplementation((ratings, targets, at) => {
      if (first) {
        first = false
        catalog.saveMetadata(
          late,
          { tmdbId: late, imdbId: 'tt32268156' } as TitleMetadata,
          'matched'
        )
      }
      return original(ratings, targets, at)
    })

    await imdb.run()

    const byName = Object.fromEntries(catalog.listMovies().map((m) => [m.name, m.imdb?.rating]))
    expect(byName).toEqual({ 'Drž hubu': 7.4, 'Úkryt nebo past': 5.9 })
  })
})
