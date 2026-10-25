import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Database } from '../db/database'
import { AutoThemes, type AutoThemesOptions } from './AutoThemes'

let dir: string
let db: Database
let enabled: boolean
let now: Date
let lookup: ReturnType<typeof vi.fn<AutoThemesOptions['lookup']>>
let download: ReturnType<typeof vi.fn<AutoThemesOptions['download']>>
let hasLocalTheme: ReturnType<typeof vi.fn<AutoThemesOptions['hasLocalTheme']>>
let auto: AutoThemes

function addTitle(kind: 'movie' | 'show', tmdbId: number | null, withFile = true): number {
  const id = Number(
    db
      .prepare(
        "INSERT INTO title (kind, group_key, name, created_at, tmdb_id) VALUES (?, ?, ?, '', ?)"
      )
      .run(kind, `t${Math.random()}`, 'Titul', tmdbId).lastInsertRowid
  )
  if (withFile)
    db.prepare(
      `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at, title_id)
       VALUES (1, ?, ?, 0, 0, '', '', ?)`
    ).run(`C:\\Filmy\\${id}.mkv`, `${id}.mkv`, id)
  return id
}

const statusOf = (titleId: number): unknown =>
  db.prepare('SELECT status FROM title_theme_auto WHERE title_id = ?').get(titleId)?.['status']

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kinoteka-auto-'))
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\Filmy', 'Filmy', 'local', '')"
  ).run()
  enabled = true
  now = new Date('2026-10-25T10:00:00Z')
  lookup = vi.fn(async (_kind, tmdbId) => `https://www.youtube.com/watch?v=video${tmdbId}`)
  download = vi.fn(async (_url, target, name) => {
    writeFileSync(join(target, `${name}.m4a`), 'zvuk')
    return `${name}.m4a`
  })
  hasLocalTheme = vi.fn(async () => false)
  auto = new AutoThemes({
    db,
    dir,
    enabled: () => enabled,
    lookup,
    download,
    hasLocalTheme,
    pauseMs: 0,
    now: () => now
  })
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('AutoThemes', () => {
  it('stáhne melodie titulů spárovaných s TMDB a ohlásí je', async () => {
    const movie = addTitle('movie', 603)
    const show = addTitle('show', 1396)
    addTitle('movie', null) // bez shody na TMDB
    addTitle('movie', 5, false) // bez souboru v knihovně
    const downloaded: number[] = []
    auto.on('downloaded', (id) => downloaded.push(id))

    await auto.run()

    expect(lookup.mock.calls).toEqual([
      ['movie', 603],
      ['show', 1396]
    ])
    expect(downloaded).toEqual([movie, show])
    expect(auto.file(movie)).toEqual({
      file: expect.stringMatching(new RegExp(`^auto-${movie}-\\d+\\.m4a$`)),
      url: 'https://www.youtube.com/watch?v=video603'
    })
    expect(auto.status()).toEqual({ pending: 0, downloaded: 2, missing: 0, running: false })
  })

  it('titul, který ThemerrDB nezná, zkusí zase až za měsíc', async () => {
    const id = addTitle('movie', 1)
    lookup.mockResolvedValue(null)
    await auto.run()
    expect(statusOf(id)).toBe('none')
    expect(download).not.toHaveBeenCalled()

    now = new Date('2026-11-10T10:00:00Z')
    expect(auto.status().pending).toBe(0)
    now = new Date('2026-11-30T10:00:00Z')
    expect(auto.status().pending).toBe(1)
  })

  it('nepovedené stažení zkusí znovu za týden', async () => {
    const id = addTitle('movie', 1)
    download.mockRejectedValue(new Error('Video není dostupné.'))
    await auto.run()
    expect(statusOf(id)).toBe('error')
    expect(auto.status()).toMatchObject({ pending: 0, missing: 1 })
    now = new Date('2026-11-02T11:00:00Z')
    expect(auto.status().pending).toBe(1)
  })

  it('bez internetu přestane a titul nechá ve frontě', async () => {
    addTitle('movie', 1)
    addTitle('movie', 2)
    lookup.mockRejectedValue(new Error('fetch failed'))
    await auto.run()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(auto.status().pending).toBe(2)
  })

  it('titul s vlastní melodií nebo ruční volbou nestahuje', async () => {
    const local = addTitle('movie', 1)
    const manual = addTitle('movie', 2)
    db.prepare("INSERT INTO title_theme (title_id, source, updated_at) VALUES (?, 'none', '')").run(
      manual
    )
    hasLocalTheme.mockImplementation(async (id) => id === local)
    await auto.run()
    expect(statusOf(local)).toBe('local')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('vypnuté stahování nedělá nic', async () => {
    addTitle('movie', 1)
    enabled = false
    await auto.run()
    expect(lookup).not.toHaveBeenCalled()
    expect(auto.status().pending).toBe(0)
  })

  it('po opravě shody stáhne melodii nového titulu a starou smaže', async () => {
    const id = addTitle('movie', 1)
    await auto.run()
    const old = auto.file(id)!.file
    db.prepare('UPDATE title SET tmdb_id = 2 WHERE id = ?').run(id)
    expect(auto.file(id)).toBeNull()

    await auto.run()
    expect(lookup).toHaveBeenLastCalledWith('movie', 2)
    expect(auto.file(id)!.file).not.toBe(old)
    await vi.waitFor(() => expect(existsSync(join(dir, old))).toBe(false))
  })

  it('titul otevřený v detailu jde na řadu přednostně', async () => {
    addTitle('movie', 1)
    const wanted = addTitle('movie', 2)
    auto.prefer(wanted)
    await auto.run()
    expect(lookup.mock.calls[0]).toEqual(['movie', 2])
  })
})
