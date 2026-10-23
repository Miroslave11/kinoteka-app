import { beforeEach, describe, expect, it } from 'vitest'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase, type Database } from '../db/database'
import { PlaybackRepository } from './PlaybackRepository'

let db: Database
let catalog: CatalogRepository
let playback: PlaybackRepository

function addFile(relativePath: string): number {
  const now = new Date().toISOString()
  return Number(
    db
      .prepare(
        `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at)
         VALUES (1, ?, ?, 1000, 1, ?, ?)`
      )
      .run(`C:\\Filmy\\${relativePath}`, relativePath, now, now).lastInsertRowid
  )
}

beforeEach(() => {
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\Filmy', 'Filmy', 'local', '')"
  ).run()
  catalog = new CatalogRepository(db)
  playback = new PlaybackRepository(db)
})

describe('PlaybackRepository', () => {
  it('k souboru najde film nebo díl a popis pro přehrávač', () => {
    const movie = addFile('Den odhalení (2026).mkv')
    const episode = addFile('Země gangů S01E02 Puzzle.mkv')
    catalog.rebuild()

    expect(playback.itemForFile(movie)).toMatchObject({ episodeId: null, label: 'Den odhalení' })
    expect(playback.itemForFile(episode)).toMatchObject({ label: 'Země gangů · S01E02 · Puzzle' })
    expect(playback.itemForFile(episode)!.episodeId).not.toBeNull()
  })

  it('název dílu bere z TMDB, když ho zná', () => {
    const file = addFile('Země gangů S01E01.mkv')
    catalog.rebuild()
    const metadata = {
      name: 'Země gangů',
      seasons: [{ number: 1, name: 'Série 1', episodes: [{ number: 1, name: 'Pilot' }] }]
    }
    db.prepare('UPDATE title SET metadata = ?').run(JSON.stringify(metadata))
    expect(playback.itemForFile(file)!.label).toBe('Země gangů · S01E01 · Pilot')
  })

  it('uloží pozici, přepíše ji a po zhlédnutí ji smaže a zapíše do deníku', () => {
    const file = addFile('Den odhalení (2026).mkv')
    catalog.rebuild()
    const { titleId } = playback.itemForFile(file)!

    expect(playback.record(titleId, null, 600, 6000, new Date('2026-10-20T20:00:00Z'))).toBe(
      'progress'
    )
    playback.record(titleId, null, 1200, 6000, new Date('2026-10-20T20:10:00Z'))
    expect(playback.progress(titleId, null)).toEqual({
      position: 1200,
      duration: 6000,
      updatedAt: '2026-10-20T20:10:00.000Z'
    })

    expect(playback.record(titleId, null, 5800, 6000, new Date('2026-10-21T21:00:00Z'))).toBe(
      'watched'
    )
    expect(playback.progress(titleId, null)).toBeNull()
    expect(catalog.listMovies()[0]!.watch).toEqual({
      progress: null,
      watchCount: 1,
      lastWatchedAt: '2026-10-21T21:00:00.000Z'
    })
  })

  it('krátké nakouknutí rozkoukání zapomene', () => {
    const file = addFile('Den odhalení (2026).mkv')
    catalog.rebuild()
    const { titleId } = playback.itemForFile(file)!
    playback.record(titleId, null, 600, 6000)
    expect(playback.record(titleId, null, 20, 6000)).toBe('clear')
    expect(playback.progress(titleId, null)).toBeNull()
  })

  it('pozice dílů se ukládají zvlášť a katalog je ukáže u dílů', () => {
    const e1 = addFile('Země gangů S01E01.mkv')
    const e2 = addFile('Země gangů S01E02.mkv')
    catalog.rebuild()
    const first = playback.itemForFile(e1)!
    const second = playback.itemForFile(e2)!
    playback.record(first.titleId, first.episodeId, 2700, 2800)
    playback.record(second.titleId, second.episodeId, 900, 2800)

    const episodes = catalog.listShows()[0]!.seasons[0]!.episodes
    expect(episodes.map((e) => [e.watch.watchCount, e.watch.progress?.position ?? null])).toEqual([
      [1, null],
      [0, 900]
    ])
  })

  it('další díl přeskočí nedostupné a pokračuje další sérií', () => {
    const e1 = addFile('Země gangů S01E01.mkv')
    const e2 = addFile('Země gangů S01E02.mkv')
    const s2 = addFile('Země gangů S02E01.mkv')
    catalog.rebuild()
    db.prepare('UPDATE media_file SET available = 0 WHERE id = ?').run(e2)

    expect(playback.nextEpisode(playback.itemForFile(e1)!)?.fileId).toBe(s2)
    expect(playback.nextEpisode(playback.itemForFile(s2)!)).toBeUndefined()
  })

  it('pamatuje si zvukovou stopu pro celý seriál a přepíše ji novou volbou', () => {
    const file = addFile('Země gangů S01E01.mkv')
    catalog.rebuild()
    const { titleId } = playback.itemForFile(file)!
    expect(playback.trackPreference(titleId, 'audio')).toBeNull()

    playback.saveTrackPreference(titleId, 'audio', { language: 'en', title: null })
    playback.saveTrackPreference(titleId, 'audio', { language: 'cs', title: 'Dabing' })
    expect(playback.trackPreference(titleId, 'audio')).toEqual({ language: 'cs', title: 'Dabing' })
    expect(playback.trackPreference(titleId, 'sub')).toBeNull()
  })

  it('zhlédnutý titul zůstane po smazání souboru v databázi a vrátí se s ním', () => {
    const file = addFile('Den odhalení (2026).mkv')
    catalog.rebuild()
    const { titleId } = playback.itemForFile(file)!
    playback.record(titleId, null, 5900, 6000)

    db.prepare('DELETE FROM media_file').run()
    catalog.rebuild()
    expect(catalog.listMovies()).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM watch_event').get()).toEqual({ n: 1 })

    addFile('Den odhalení (2026).mkv')
    catalog.rebuild()
    expect(catalog.listMovies()[0]).toMatchObject({ id: titleId, watch: { watchCount: 1 } })
  })
})
