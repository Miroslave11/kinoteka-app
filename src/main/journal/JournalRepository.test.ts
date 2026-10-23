import { beforeEach, describe, expect, it } from 'vitest'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase, type Database } from '../db/database'
import { PlaybackRepository } from '../playback/PlaybackRepository'
import { JournalRepository } from './JournalRepository'

let db: Database
let catalog: CatalogRepository
let playback: PlaybackRepository
let journal: JournalRepository

function addFile(relativePath: string, durationSec?: number): number {
  const now = new Date().toISOString()
  return Number(
    db
      .prepare(
        `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at, media_info)
         VALUES (1, ?, ?, 1000, 1, ?, ?, ?)`
      )
      .run(
        `C:\\Filmy\\${relativePath}`,
        relativePath,
        now,
        now,
        durationSec
          ? JSON.stringify({
              container: 'MKV',
              durationSec,
              bitrate: null,
              video: null,
              audio: [],
              subtitles: []
            })
          : null
      ).lastInsertRowid
  )
}

beforeEach(() => {
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\Filmy', 'Filmy', 'local', '')"
  ).run()
  catalog = new CatalogRepository(db)
  playback = new PlaybackRepository(db)
  journal = new JournalRepository(db)
})

describe('JournalRepository', () => {
  it('záznamy z přehrávače i ruční, s pořadím zhlédnutí, délkou a hodnocením', () => {
    const file = addFile('Prázdnota (2020).mkv', 6000)
    catalog.rebuild()
    const { titleId } = playback.itemForFile(file)!
    playback.record(titleId, null, 5900, 6000, new Date('2026-10-12T20:00:00Z'))
    journal.addManual({
      titleId,
      episodeIds: [],
      watchedAt: '2026-10-20T19:00:00.000Z',
      note: 'Podruhé'
    })
    journal.setRating(titleId, 4)

    expect(journal.list()).toMatchObject([
      {
        titleName: 'Prázdnota',
        source: 'manual',
        note: 'Podruhé',
        ordinal: 2,
        rating: 4,
        runtimeMin: 100
      },
      { source: 'auto', ordinal: 1, rating: 4, inLibrary: true }
    ])
    expect(catalog.listMovies()[0]).toMatchObject({ myRating: 4, watch: { watchCount: 2 } })
  })

  it('ruční záznam dílů: jen díly daného seriálu, rozkoukání se zruší', () => {
    const e1 = addFile('Země gangů S01E01.mkv')
    const e2 = addFile('Země gangů S01E02 Puzzle.mkv')
    const other = addFile('Vidím vás S01E01.mkv')
    catalog.rebuild()
    const first = playback.itemForFile(e1)!
    const second = playback.itemForFile(e2)!
    const foreign = playback.itemForFile(other)!
    playback.record(second.titleId, second.episodeId, 600, 3000)

    const added = journal.addManual({
      titleId: first.titleId,
      episodeIds: [first.episodeId!, second.episodeId!, foreign.episodeId!],
      watchedAt: '2026-10-21T20:00:00.000Z',
      note: null
    })
    expect(added).toBe(2)
    expect(playback.progress(second.titleId, second.episodeId)).toBeNull()
    expect(
      journal
        .list()
        .map((e) => e.episode?.name ?? null)
        .sort()
    ).toEqual(['Puzzle', null])
  })

  it('úprava, odebrání a zrušení hodnocení', () => {
    addFile('Prázdnota (2020).mkv')
    catalog.rebuild()
    const titleId = catalog.listMovies()[0]!.id
    journal.addManual({
      titleId,
      episodeIds: [],
      watchedAt: '2026-10-01T10:00:00.000Z',
      note: null
    })
    const [entry] = journal.list()
    journal.update(entry!.id, { watchedAt: '2026-09-01T10:00:00.000Z', note: 'Kino' })
    expect(journal.list()[0]).toMatchObject({ watchedAt: '2026-09-01T10:00:00.000Z', note: 'Kino' })

    journal.setRating(titleId, 5)
    journal.setRating(titleId, null)
    expect(journal.ratings().size).toBe(0)

    journal.remove(entry!.id)
    expect(journal.list()).toEqual([])
  })

  it('ohodnocený titul bez zhlédnutí zůstane po smazání souboru', () => {
    addFile('Prázdnota (2020).mkv')
    catalog.rebuild()
    const titleId = catalog.listMovies()[0]!.id
    journal.setRating(titleId, 3)
    db.prepare('DELETE FROM media_file').run()
    catalog.rebuild()
    expect(journal.ratings().get(titleId)).toBe(3)
  })
})
