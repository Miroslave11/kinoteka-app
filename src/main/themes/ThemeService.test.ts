import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Database } from '../db/database'
import { ThemeService } from './ThemeService'

let root: string
let library: string
let themesDir: string
let db: Database
let download: ReturnType<typeof vi.fn<(url: string, dir: string, name: string) => Promise<string>>>
let themes: ThemeService

function addTitle(kind: 'movie' | 'show', name: string): number {
  return Number(
    db
      .prepare("INSERT INTO title (kind, group_key, name, created_at) VALUES (?, ?, ?, '')")
      .run(kind, name.toLowerCase(), name).lastInsertRowid
  )
}

/** Soubor filmu na disku (prázdný) zapsaný v knihovně u titulu. */
function addFile(titleId: number, relativePath: string): string {
  const path = join(library, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '')
  db.prepare(
    `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at, title_id)
     VALUES (1, ?, ?, 0, 0, '', '', ?)`
  ).run(path, relativePath, titleId)
  return path
}

const touch = (relativePath: string): string => {
  const path = join(library, relativePath)
  writeFileSync(path, 'zvuk')
  return path
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kinoteka-theme-'))
  library = join(root, 'Filmy')
  themesDir = join(root, 'themes')
  mkdirSync(library)
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, ?, 'Filmy', 'local', '')"
  ).run(library)
  download = vi.fn(async (_url: string, dir: string, name: string) => {
    writeFileSync(join(dir, `${name}.m4a`), 'stažené')
    return `${name}.m4a`
  })
  themes = new ThemeService({ db, dir: themesDir, download })
})

afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

describe('ThemeService', () => {
  it('bez melodie vrátí prázdnou informaci', async () => {
    const id = addTitle('movie', 'Matrix')
    addFile(id, 'Matrix (1999).mkv')
    expect(await themes.info(id)).toEqual({ url: null, source: null, link: null })
    expect(await themes.path(id)).toBeNull()
  })

  it('najde melodii pojmenovanou podle souboru filmu i v ploché složce', async () => {
    const matrix = addTitle('movie', 'Matrix')
    const other = addTitle('movie', 'Vetřelec')
    addFile(matrix, 'Matrix (1999).mkv')
    addFile(other, 'Vetřelec (1979).mkv')
    const theme = touch('Matrix (1999).theme.mp3')

    const info = await themes.info(matrix)
    expect(info.source).toBe('local')
    expect(info.url).toMatch(new RegExp(`^kinoteka-media://theme/${matrix}\\?v=\\d+$`))
    expect(await themes.path(matrix)).toBe(theme)
    expect((await themes.info(other)).source).toBeNull()
  })

  it('theme.mp3 ve sdílené složce nepatří žádnému titulu', async () => {
    const matrix = addTitle('movie', 'Matrix')
    addFile(matrix, 'Matrix (1999).mkv')
    addFile(addTitle('movie', 'Vetřelec'), 'Vetřelec (1979).mkv')
    touch('theme.mp3')
    expect((await themes.info(matrix)).source).toBeNull()
  })

  it('theme.mp3 ve složce seriálu i nad složkami sérií', async () => {
    const show = addTitle('show', 'Dark')
    addFile(show, 'Dark/Série 1/Dark S01E01.mkv')
    addFile(show, 'Dark/Série 2/Dark S02E01.mkv')
    addFile(addTitle('movie', 'Matrix'), 'Matrix (1999).mkv')
    const theme = touch('Dark/theme.mp3')
    expect(await themes.path(show)).toBe(theme)
  })

  it('vybraný soubor se zkopíruje a má přednost před souborem u filmu', async () => {
    const id = addTitle('movie', 'Matrix')
    addFile(id, 'Matrix (1999).mkv')
    touch('Matrix (1999).theme.mp3')
    const picked = join(root, 'moje.mp3')
    writeFileSync(picked, 'vybraný')

    const result = await themes.chooseFile(id, picked)
    expect(result).toMatchObject({ ok: true, info: { source: 'file' } })
    expect(await themes.path(id)).toMatch(/themes[\\/]\d+-\d+\.mp3$/)
    expect(readdirSync(themesDir)).toHaveLength(1)
  })

  it('jiný než zvukový soubor odmítne', async () => {
    const id = addTitle('movie', 'Matrix')
    expect(await themes.chooseFile(id, join(root, 'film.mkv'))).toMatchObject({ ok: false })
  })

  it('stáhne melodii z YouTube a starou smaže', async () => {
    const id = addTitle('movie', 'Matrix')
    const picked = join(root, 'moje.mp3')
    writeFileSync(picked, 'vybraný')
    await themes.chooseFile(id, picked)

    const result = await themes.chooseYoutube(id, 'https://youtu.be/SLBACEP6LsI')
    expect(download).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=SLBACEP6LsI',
      themesDir,
      expect.stringMatching(new RegExp(`^${id}-\\d+$`))
    )
    expect(result).toMatchObject({
      ok: true,
      info: { source: 'youtube', link: 'https://www.youtube.com/watch?v=SLBACEP6LsI' }
    })
    expect(readdirSync(themesDir)).toEqual([expect.stringMatching(/\.m4a$/)])
  })

  it('neplatný odkaz a chybu stahování vrátí srozumitelně', async () => {
    const id = addTitle('movie', 'Matrix')
    expect(await themes.chooseYoutube(id, 'https://example.com/x')).toEqual({
      ok: false,
      message: 'Tohle není odkaz na video z YouTube.'
    })
    download.mockRejectedValueOnce(new Error('Video není dostupné.'))
    expect(await themes.chooseYoutube(id, 'https://youtu.be/SLBACEP6LsI')).toEqual({
      ok: false,
      message: 'Video není dostupné.'
    })
  })

  it('„Bez melodie“ umlčí i soubor u filmu, „Původní“ ho vrátí', async () => {
    const id = addTitle('movie', 'Matrix')
    addFile(id, 'Matrix (1999).mkv')
    touch('Matrix (1999).theme.mp3')

    expect(await themes.setNone(id)).toEqual({ url: null, source: 'none', link: null })
    expect(await themes.path(id)).toBeNull()
    expect((await themes.reset(id)).source).toBe('local')
  })

  it('smaže melodie titulů, které zmizely', async () => {
    const id = addTitle('movie', 'Matrix')
    await themes.chooseYoutube(id, 'https://youtu.be/SLBACEP6LsI')
    writeFileSync(join(themesDir, 'stara.m4a'), 'x')
    await themes.removeOrphans()
    expect(readdirSync(themesDir)).toHaveLength(1)

    db.prepare('DELETE FROM title WHERE id = ?').run(id)
    await themes.removeOrphans()
    expect(readdirSync(themesDir)).toEqual([])
  })
})
