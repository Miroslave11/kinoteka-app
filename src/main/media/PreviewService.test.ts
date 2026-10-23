import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaInfo } from '../../shared/mediaInfo'
import type { TitleMetadata } from '../../shared/metadata'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase, type Database } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import { PreviewService, type PreviewTools } from './PreviewService'

let dir: string
let db: Database
let catalog: CatalogRepository
let settings: SettingsRepository

/** Červený „plakát“ 2×2 pixely. */
const RED = new Uint8Array([200, 20, 20, 200, 20, 20, 200, 20, 20, 10, 10, 10])

function addFile(relativePath: string, durationSec = 6000, hdr: string | null = null): number {
  const info: MediaInfo = {
    container: 'MKV',
    bitrate: null,
    audio: [],
    subtitles: [],
    durationSec,
    video: {
      codec: 'HEVC',
      width: 3840,
      height: 2160,
      fps: 24,
      bitDepth: 10,
      hdr: hdr as never,
      bitrate: null
    }
  }
  const id = Number(
    db
      .prepare(
        `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at, media_info)
         VALUES (1, ?, ?, 1, 1, '', '', ?)`
      )
      .run(`C:\\F\\${relativePath}`, relativePath, JSON.stringify(info)).lastInsertRowid
  )
  catalog.rebuild()
  return id
}

function tools(overrides: Partial<PreviewTools> = {}): PreviewTools {
  return {
    poster: vi.fn(async () => Buffer.from('jpg')),
    pixels: vi.fn(async () => RED),
    clip: vi.fn(async (_input: string, _start: number, output: string) => writeFile(output, 'mp4')),
    ...overrides
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kinoteka-clips-'))
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\F', 'F', 'local', '')"
  ).run()
  catalog = new CatalogRepository(db)
  settings = new SettingsRepository(db)
})

afterEach(() => rm(dir, { recursive: true, force: true }))

describe('PreviewService', () => {
  it('spočítá paletu z plakátu a vyrobí tři klipy z filmu', async () => {
    addFile('Prázdnota (2020).mkv')
    const movie = catalog.listMovies()[0]!
    catalog.saveMetadata(
      movie.id,
      { tmdbId: 1, imdbId: null, posterUrl: 'kinoteka-media://tmdb/w500/p.jpg' } as TitleMetadata,
      'matched'
    )
    const fakeTools = tools()

    await new PreviewService(catalog, settings, fakeTools, dir).run()

    const [updated] = catalog.listMovies()
    expect(fakeTools.poster).toHaveBeenCalledWith('/w500/p.jpg')
    expect(updated!.palette?.accent).toMatch(/^hsl\((\d|1\d|35\d) /)
    expect(updated!.clips).toEqual([
      `kinoteka-media://clips/${updated!.files[0]!.id}-0.mp4`,
      `kinoteka-media://clips/${updated!.files[0]!.id}-1.mp4`,
      `kinoteka-media://clips/${updated!.files[0]!.id}-2.mp4`
    ])
    expect(await readdir(dir)).toHaveLength(3)
  })

  it('u seriálu dělá klipy jen z prvního dílu; HDR předá dál', async () => {
    addFile('Dark S01E02.mkv', 3000)
    addFile('Dark S01E01.mkv', 3000, 'HDR10')
    const clip = vi.fn(async (_i: string, _s: number, output: string, _hdr: boolean) =>
      writeFile(output, 'x')
    )
    await new PreviewService(catalog, settings, tools({ clip }), dir).run()
    const inputs = new Set(clip.mock.calls.map(([input]) => input))
    expect([...inputs]).toEqual(['C:\\F\\Dark S01E01.mkv'])
    expect(clip.mock.calls.every(([, , , hdr]) => hdr === true)).toBe(true)
  })

  it('hotové soubory znovu nezpracovává; nepovedený klip se nezkouší dokola', async () => {
    addFile('Prázdnota (2020).mkv')
    const clip = vi.fn(async () => {
      throw new Error('Invalid data')
    })
    const preview = new PreviewService(catalog, settings, tools({ clip }), dir)
    await preview.run()
    await preview.run()
    expect(clip).toHaveBeenCalledTimes(1)
    expect(catalog.listMovies()[0]!.clips).toEqual([])
  })

  it('vypnutí klipů smaže soubory a nové nevyrábí', async () => {
    addFile('Prázdnota (2020).mkv')
    const preview = new PreviewService(catalog, settings, tools(), dir)
    await preview.run()
    await preview.setClipsEnabled(false)
    await preview.run()
    expect(catalog.listMovies()[0]!.clips).toEqual([])
    await expect(readdir(dir)).rejects.toThrow()
    expect(preview.status()).toMatchObject({ clipsEnabled: false, pending: 0 })
  })

  it('smaže klipy, na které už nic neodkazuje', async () => {
    await writeFile(join(dir, '999-0.mp4'), 'stary')
    addFile('Prázdnota (2020).mkv')
    await new PreviewService(catalog, settings, tools(), dir).run()
    expect((await readdir(dir)).includes('999-0.mp4')).toBe(false)
  })
})
