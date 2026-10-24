import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase, type Database } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import {
  MOVIE_PRAZDNOTA,
  SEARCH_PRAZDNOTA,
  SEARCH_VIDIM_VAS,
  SEASON_VIDIM_VAS_1,
  SHOW_VIDIM_VAS
} from './fixtures'
import { MetadataService, type TmdbApi } from './MetadataService'
import { TmdbError } from './TmdbClient'

let db: Database
let catalog: CatalogRepository
let settings: SettingsRepository

function addFile(relativePath: string): void {
  db.prepare(
    `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at)
     VALUES (1, ?, ?, 1, 1, '', '')`
  ).run(`C:\\F\\${relativePath}`, relativePath)
}

/** Falešné TMDB podle uložených odpovědí. */
function fakeApi(overrides: Partial<TmdbApi> = {}): TmdbApi {
  return {
    validate: vi.fn(async () => true),
    searchMovie: vi.fn(async (query: string) =>
      query.toLowerCase().startsWith('pr') ? SEARCH_PRAZDNOTA : { results: [] }
    ),
    searchTv: vi.fn(async (query: string) =>
      /vid|watcher/i.test(query) ? SEARCH_VIDIM_VAS : { results: [] }
    ),
    movie: vi.fn(async () => MOVIE_PRAZDNOTA),
    tv: vi.fn(async () => SHOW_VIDIM_VAS),
    tvSeason: vi.fn(async () => SEASON_VIDIM_VAS_1),
    ...overrides
  }
}

function service(api: TmdbApi, key = 'a'.repeat(32)): MetadataService {
  if (key) settings.set('tmdb.key', key)
  return new MetadataService(catalog, settings, () => api)
}

beforeEach(() => {
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\F', 'F', 'local', '')"
  ).run()
  catalog = new CatalogRepository(db)
  settings = new SettingsRepository(db)
})

describe('MetadataService', () => {
  it('bez klíče nic nedělá', async () => {
    addFile('Prázdnota (2020) cz dabing.mkv')
    catalog.rebuild()
    const api = fakeApi()
    await service(api, '').run()
    expect(api.searchMovie).not.toHaveBeenCalled()
    expect(catalog.listMovies()[0]).toMatchObject({ matchStatus: 'pending', metadata: null })
  })

  it('dohledá film podle názvu a roku a uloží metadata', async () => {
    addFile('Prázdnota (2020) cz dabing.mkv')
    catalog.rebuild()
    await service(fakeApi()).run()
    const [movie] = catalog.listMovies()
    expect(movie).toMatchObject({
      matchStatus: 'matched',
      metadata: { tmdbId: 9001, originalName: 'The Void' }
    })
  })

  it('seriál dohledá i s díly a sloučí soubory pojmenované různě', async () => {
    addFile('Vidím Vás S01E01.mkv')
    addFile('The Watcher S01E02.mkv')
    catalog.rebuild()
    expect(catalog.listShows()).toHaveLength(2)

    await service(fakeApi()).run()

    const shows = catalog.listShows()
    expect(shows).toHaveLength(1)
    expect(shows[0]).toMatchObject({ matchStatus: 'matched', episodeCount: 2 })
    expect(shows[0]!.metadata?.seasons[0]?.episodes).toHaveLength(3)

    // Sloučení vydrží i další sken.
    catalog.rebuild()
    expect(catalog.listShows()).toHaveLength(1)
  })

  it('nic odpovídajícího → nedohledáno; chyba sítě → error', async () => {
    addFile('Úkryt nebo past (2026) cz dabing.mkv')
    addFile('Prázdnota (2020).mkv')
    catalog.rebuild()
    const api = fakeApi({
      movie: vi.fn(async () => {
        throw new TmdbError('TMDB není dostupné: ENOTFOUND')
      })
    })
    await service(api).run()
    const byName = Object.fromEntries(catalog.listMovies().map((m) => [m.name, m.matchStatus]))
    expect(byName).toEqual({ 'Úkryt nebo past': 'unmatched', Prázdnota: 'error' })
  })

  it('ruční shoda má přednost a hledání vrací výsledky pro dialog', async () => {
    addFile('Úkryt nebo past (2026) cz dabing.mkv')
    catalog.rebuild()
    const metadata = service(fakeApi())
    await metadata.run()
    const id = catalog.listMovies()[0]!.id

    const results = await metadata.search('movie', 'Prázdnota', null)
    expect(results.map((r) => r.tmdbId)).toEqual([9000, 9001])

    await metadata.applyMatch(id, 9001)
    expect(catalog.listMovies()[0]).toMatchObject({
      matchStatus: 'manual',
      metadata: { tmdbId: 9001 }
    })
  })

  it('uložení klíče: ověří ho a nepovedené tituly zkusí znovu', async () => {
    addFile('Prázdnota (2020).mkv')
    catalog.rebuild()
    catalog.setMatchStatus(catalog.listMovies()[0]!.id, 'unmatched')
    const api = fakeApi()
    const metadata = new MetadataService(catalog, settings, () => api)

    expect(await metadata.saveKey('kratky')).toMatchObject({ ok: false })
    const rejecting = new MetadataService(catalog, settings, () =>
      fakeApi({ validate: vi.fn(async () => false) })
    )
    expect(await rejecting.saveKey('b'.repeat(32))).toMatchObject({ ok: false })
    expect(metadata.keyStatus()).toEqual({ configured: false })

    expect(await metadata.saveKey('c'.repeat(32))).toEqual({ ok: true })
    expect(metadata.keyStatus()).toMatchObject({ configured: true, valid: true })
    await metadata.run()
    expect(catalog.listMovies()[0]!.matchStatus).toBe('matched')
  })
})

describe('MetadataService – obnova údajů', () => {
  it('Znovu načíst: načte podle známého TMDB ID, nehledá a ruční shodu zachová', async () => {
    addFile('Úkryt nebo past (2026) cz dabing.mkv')
    catalog.rebuild()
    const api = fakeApi()
    const metadata = service(api)
    const id = catalog.listMovies()[0]!.id
    await metadata.applyMatch(id, 9001)
    vi.mocked(api.searchMovie).mockClear()

    await metadata.refresh(id)

    expect(api.searchMovie).not.toHaveBeenCalled()
    expect(catalog.listMovies()[0]).toMatchObject({
      matchStatus: 'manual',
      metadata: { tmdbId: 9001, imdbId: 'tt0000001' }
    })
  })

  it('běžící seriál obnoví jednou denně, skončený ne; výpadek sítě shodu nezmění', async () => {
    addFile('Vidím Vás S01E01.mkv')
    addFile('Prázdnota (2020).mkv')
    catalog.rebuild()
    const next = { air_date: '2026-10-31', season_number: 1, episode_number: 4, name: 'Nový' }
    const api = fakeApi({
      tv: vi.fn(async () => ({ ...SHOW_VIDIM_VAS, status: 'Returning Series' }))
    })
    const metadata = service(api)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-24T08:00:00Z'))
      await metadata.run()
      expect(catalog.listShows()[0]!.metadata?.airing).toEqual({
        status: 'running',
        nextEpisode: null
      })

      // Do druhého dne se nic nenačítá.
      vi.mocked(api.tv).mockClear()
      vi.setSystemTime(new Date('2026-10-25T07:00:00Z'))
      await metadata.run()
      expect(api.tv).not.toHaveBeenCalled()

      // Po dni jen seriál (film ne) – a nově ohlášený díl.
      vi.mocked(api.tv).mockImplementation(async () => ({
        ...SHOW_VIDIM_VAS,
        status: 'Returning Series',
        next_episode_to_air: next
      }))
      vi.setSystemTime(new Date('2026-10-25T09:00:00Z'))
      await metadata.run()
      expect(api.movie).toHaveBeenCalledTimes(1)
      expect(catalog.listShows()[0]!.metadata?.airing?.nextEpisode).toMatchObject({ episode: 4 })

      // Výpadek sítě: shoda i údaje zůstanou, zkusí se za hodinu.
      vi.mocked(api.tv).mockImplementation(async () => {
        throw new TmdbError('TMDB není dostupné: ENOTFOUND')
      })
      vi.setSystemTime(new Date('2026-10-26T10:00:00Z'))
      await metadata.run()
      expect(catalog.listShows()[0]).toMatchObject({
        matchStatus: 'matched',
        metadata: { airing: { nextEpisode: { episode: 4 } } }
      })
      vi.mocked(api.tv).mockClear()
      vi.setSystemTime(new Date('2026-10-26T10:30:00Z'))
      await metadata.run()
      expect(api.tv).not.toHaveBeenCalled()
      vi.setSystemTime(new Date('2026-10-26T11:01:00Z'))
      await metadata.run()
      expect(api.tv).toHaveBeenCalled()

      // Skončený seriál se už neobnovuje.
      vi.mocked(api.tv).mockImplementation(async () => ({ ...SHOW_VIDIM_VAS, status: 'Ended' }))
      vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
      await metadata.run()
      vi.mocked(api.tv).mockClear()
      vi.setSystemTime(new Date('2026-11-28T10:00:00Z'))
      await metadata.run()
      expect(api.tv).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
