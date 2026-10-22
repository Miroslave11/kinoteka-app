import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../db/database'
import { CatalogRepository } from './CatalogRepository'

let db: Database
let catalog: CatalogRepository

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
})

describe('CatalogRepository', () => {
  it('rozdělí soubory na filmy a seriály včetně štítků', () => {
    addFile('Den odhalení (2026) CZ DABING.mkv')
    addFile('Země gangů S01E01 CZ Dab 2025.mkv')
    addFile('Země gangů_S01E02_Puzzle.mp4')
    catalog.rebuild()

    expect(catalog.listMovies()).toMatchObject([
      {
        name: 'Den odhalení',
        year: 2026,
        tags: ['CZ dabing'],
        files: [{ fileName: 'Den odhalení (2026) CZ DABING.mkv' }]
      }
    ])
    const [show] = catalog.listShows()
    expect(show).toMatchObject({
      name: 'Země gangů',
      year: 2025,
      episodeCount: 2,
      tags: ['CZ dabing']
    })
    expect(show!.seasons[0]!.episodes.map((e) => [e.episode, e.name])).toEqual([
      [1, null],
      [2, 'Puzzle']
    ])
  })

  it('při opakovaném sestavení zachová id titulů a dílů', () => {
    addFile('Vidím Vás (2022) S01E01 HD CZ Dabing!!!.mkv')
    addFile('Prázdnota (2020) cz dabing.mkv')
    catalog.rebuild()
    const showId = catalog.listShows()[0]!.id
    const episodeId = catalog.listShows()[0]!.seasons[0]!.episodes[0]!.id
    const movieId = catalog.listMovies()[0]!.id

    // přibude díl pod jiným názvem souboru – seriál musí zůstat stejný
    addFile('Vidim vas - The.Watcher.S01E03.WEBRip.CZ.5.1.mp4')
    catalog.rebuild()

    const [show] = catalog.listShows()
    expect(show!.id).toBe(showId)
    expect(show!.alternativeNames).toEqual(['The Watcher'])
    expect(show!.seasons[0]!.episodes.map((e) => e.episode)).toEqual([1, 3])
    expect(show!.seasons[0]!.episodes[0]!.id).toBe(episodeId)
    expect(catalog.listMovies()[0]!.id).toBe(movieId)
  })

  it('titul bez souborů zmizí', () => {
    const id = addFile('Prázdnota (2020) cz dabing.mkv')
    catalog.rebuild()
    db.prepare('DELETE FROM media_file WHERE id = ?').run(id)
    catalog.rebuild()
    expect(catalog.listMovies()).toEqual([])
    expect(db.prepare('SELECT count(*) AS n FROM title').get()).toEqual({ n: 0 })
  })

  it('dva seriály, které se novým souborem propojí, se sloučí do jednoho', () => {
    addFile('Vidím Vás S01E01.mkv')
    addFile('The Watcher S01E02.mkv')
    catalog.rebuild()
    expect(catalog.listShows()).toHaveLength(2)

    addFile('Vidim vas - The Watcher S01E03.mkv')
    catalog.rebuild()
    const shows = catalog.listShows()
    expect(shows).toHaveLength(1)
    expect(shows[0]!.episodeCount).toBe(3)
  })
})
