import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  diffScan,
  isFolderReachable,
  isIgnoredDir,
  listVideoFiles,
  type FoundFile
} from './scanner'

const found = (path: string, size = 100, mtimeMs = 1000): FoundFile => ({
  path,
  relativePath: path.split('\\').pop()!,
  size,
  mtimeMs
})

describe('diffScan', () => {
  it('rozpozná nové, změněné, nezměněné a smazané soubory', () => {
    const stored = [
      { id: 1, path: 'C:\\F\\a.mkv', size: 100, mtimeMs: 1000 },
      { id: 2, path: 'C:\\F\\b.mkv', size: 100, mtimeMs: 1000 },
      { id: 3, path: 'C:\\F\\c.mkv', size: 300, mtimeMs: 3000 }
    ]
    const diff = diffScan(stored, {
      files: [found('C:\\F\\a.mkv'), found('C:\\F\\b.mkv', 999), found('C:\\F\\d.mkv', 5, 5)],
      unreadableDirs: []
    })
    expect(diff.unchanged).toBe(1)
    expect(diff.updated.map((u) => u.id)).toEqual([2])
    expect(diff.added.map((f) => f.path)).toEqual(['C:\\F\\d.mkv'])
    expect(diff.removed).toEqual([3])
    expect(diff.moved).toEqual([])
  })

  it('přejmenovaný soubor si ponechá id', () => {
    const stored = [{ id: 7, path: 'C:\\F\\stary nazev.mkv', size: 4242, mtimeMs: 77 }]
    const diff = diffScan(stored, {
      files: [found('C:\\F\\Serial\\novy nazev.mkv', 4242, 77)],
      unreadableDirs: []
    })
    expect(diff.moved).toEqual([{ id: 7, file: found('C:\\F\\Serial\\novy nazev.mkv', 4242, 77) }])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })

  it('cesty porovnává bez ohledu na velikost písmen', () => {
    const stored = [{ id: 1, path: 'C:\\Filmy\\FILM.mkv', size: 100, mtimeMs: 1000 }]
    const diff = diffScan(stored, { files: [found('c:\\filmy\\film.mkv')], unreadableDirs: [] })
    expect(diff.unchanged).toBe(1)
    expect(diff.added).toEqual([])
  })

  it('soubory v nečitelné podsložce nemaže', () => {
    const stored = [
      { id: 1, path: 'C:\\F\\Zamceno\\x.mkv', size: 1, mtimeMs: 1 },
      { id: 2, path: 'C:\\F\\Zamceno2.mkv', size: 2, mtimeMs: 2 }
    ]
    const diff = diffScan(stored, { files: [], unreadableDirs: ['C:\\F\\Zamceno'] })
    expect(diff.removed).toEqual([2])
    expect(diff.unchanged).toBe(1)
  })
})

describe('isIgnoredDir', () => {
  it.each([
    ['$RECYCLE.BIN', true],
    ['#recycle', true],
    ['@eaDir', true],
    ['.git', true],
    ['System Volume Information', true],
    ['Seriály', false],
    ['Země gangů', false]
  ])('%s → %s', (name, expected) => {
    expect(isIgnoredDir(name)).toBe(expected)
  })
})

describe('listVideoFiles', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kinoteka-scan-'))
    await mkdir(join(root, 'Seriály', 'Země gangů'), { recursive: true })
    await mkdir(join(root, '@eaDir'))
    await writeFile(join(root, 'Den odhalení (2026) CZ DABING.mkv'), 'video')
    await writeFile(join(root, 'Den odhalení (2026) CZ DABING.srt'), 'titulky')
    await writeFile(join(root, 'Seriály', 'Země gangů', 'Země gangů S01E01.mp4'), 'video')
    await writeFile(join(root, '@eaDir', 'náhled.mkv'), 'synology')
  })

  afterEach(() => rm(root, { recursive: true, force: true }))

  it('najde videa i v podsložkách a přeskočí systémové složky a jiné soubory', async () => {
    const { files, unreadableDirs } = await listVideoFiles(root)
    expect(files.map((f) => f.relativePath).sort()).toEqual([
      'Den odhalení (2026) CZ DABING.mkv',
      join('Seriály', 'Země gangů', 'Země gangů S01E01.mp4')
    ])
    expect(files[0]!.size).toBe(5)
    expect(unreadableDirs).toEqual([])
  })

  it('neexistující složka vyhodí chybu', async () => {
    await expect(listVideoFiles(join(root, 'neexistuje'))).rejects.toThrow()
  })

  it('isFolderReachable', async () => {
    expect(await isFolderReachable(root)).toBe(true)
    expect(await isFolderReachable(join(root, 'neexistuje'))).toBe(false)
    expect(await isFolderReachable(join(root, 'Den odhalení (2026) CZ DABING.mkv'))).toBe(false)
  })
})
