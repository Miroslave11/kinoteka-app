import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaFileSummary } from '../../shared/library'
import type { LibraryRepository } from '../library/LibraryRepository'
import { DeletionService, ownSubtitles, type DeletionOps } from './DeletionService'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-delete-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const touch = async (name: string): Promise<string> => {
  const file = join(root, name)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, 'x')
  return file
}

function setup(files: Record<number, Partial<MediaFileSummary> & { path: string }>): {
  service: DeletionService
  ops: { [K in keyof DeletionOps]-?: ReturnType<typeof vi.fn> }
} {
  const library = {
    getFile: (id: number) =>
      files[id] && {
        id,
        folderId: 1,
        relativePath: basename(files[id].path),
        fileName: basename(files[id].path),
        size: 1000,
        available: true,
        addedAt: '',
        ...files[id]
      }
  } as unknown as LibraryRepository
  const ops = {
    trash: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    isPlaying: vi.fn(() => false),
    removedFromLibrary: vi.fn(),
    subtitlesOf: vi.fn(ownSubtitles)
  }
  return { service: new DeletionService(library, ops), ops }
}

describe('ownSubtitles', () => {
  it('vezme titulky filmu, ne titulky jiného filmu s delším názvem', async () => {
    const video = await touch('Alien.mkv')
    await touch('Alien Romulus.mkv')
    await touch('Alien.cz.srt')
    await touch('Alien Romulus.cz.srt')
    expect((await ownSubtitles(video)).map((f) => basename(f))).toEqual(['Alien.cz.srt'])
  })

  it('k .idx přidá i .sub', async () => {
    const video = await touch('Film.mkv')
    await touch('Film.idx')
    await touch('Film.sub')
    expect((await ownSubtitles(video)).map((f) => basename(f))).toEqual(['Film.idx', 'Film.sub'])
  })
})

describe('DeletionService', () => {
  it('lokální soubor i s titulky do Koše a z knihovny pryč', async () => {
    const video = await touch('Prázdnota (2020).mkv')
    const subtitle = await touch('Prázdnota (2020).cze.srt')
    const { service, ops } = setup({ 5: { path: video } })

    const plan = await service.plan([5])
    expect(plan).toMatchObject({ totalSize: 1000, network: false })
    expect(plan.files[0]!.subtitles).toEqual([subtitle])

    expect(await service.execute([5])).toEqual({ deleted: 1, failed: [] })
    expect(ops.trash.mock.calls).toEqual([[video], [subtitle]])
    expect(ops.remove).not.toHaveBeenCalled()
    expect(ops.removedFromLibrary).toHaveBeenCalledWith([5])
  })

  it('síťový soubor maže trvale', async () => {
    const { service, ops } = setup({ 7: { path: '\\\\DS920\\video\\Film.mkv' } })
    // Síťová cesta v testu neexistuje – titulky se nehledají.
    ops.subtitlesOf.mockResolvedValue([])
    expect((await service.plan([7])).network).toBe(true)
    await service.execute([7])
    expect(ops.remove).toHaveBeenCalledWith('\\\\DS920\\video\\Film.mkv')
    expect(ops.trash).not.toHaveBeenCalled()
  })

  it('nedostupný a právě přehrávaný soubor nesmaže, ostatní ano', async () => {
    const a = await touch('A.mkv')
    const b = await touch('B.mkv')
    const c = await touch('C.mkv')
    const { service, ops } = setup({
      1: { path: a, available: false },
      2: { path: b },
      3: { path: c }
    })
    ops.isPlaying.mockImplementation((path: string) => path === b)

    const result = await service.execute([1, 2, 3])
    expect(result.deleted).toBe(1)
    expect(result.failed.map((f) => f.message)).toEqual([
      'Soubor teď není dostupný.',
      'Soubor se právě přehrává.'
    ])
    expect(ops.removedFromLibrary).toHaveBeenCalledWith([3])
  })

  it('chyba při mazání videa: soubor zůstane v knihovně, titulky se nemažou', async () => {
    const video = await touch('Film.mkv')
    await touch('Film.srt')
    const { service, ops } = setup({ 4: { path: video } })
    ops.trash.mockRejectedValueOnce(new Error('Přístup odepřen'))
    expect(await service.execute([4])).toEqual({
      deleted: 0,
      failed: [{ path: video, message: 'Přístup odepřen' }]
    })
    expect(ops.trash).toHaveBeenCalledTimes(1)
    expect(ops.removedFromLibrary).not.toHaveBeenCalled()
  })
})
