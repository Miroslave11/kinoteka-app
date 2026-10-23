import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import { findDownloadedSubtitles } from './externalSubtitles'
import { OnlineSubtitlesService } from './OnlineSubtitlesService'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-online-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Falešné API: hledání vrací české a anglické titulky, stažení soubor ve Windows-1250. */
function fakeApi(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/subtitles?')) {
      return json({
        data: [
          { attributes: { language: 'en', download_count: 900, files: [{ file_id: 2 }] } },
          { attributes: { language: 'cs', download_count: 10, files: [{ file_id: 1 }] } }
        ]
      })
    }
    if (url.endsWith('/download')) return json({ link: 'https://dl.example/s.srt', remaining: 4 })
    // „Příliš“ ve Windows-1250
    return new Response(Buffer.from([0x31, 0x0a, 0x50, 0xf8, 0xed, 0x6c, 0x69, 0x9a, 0x0a]))
  })
}

function setup(fetchImpl = fakeApi()): {
  service: OnlineSubtitlesService
  settings: SettingsRepository
} {
  const settings = new SettingsRepository(openDatabase(':memory:'))
  const service = new OnlineSubtitlesService({
    settings,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    userAgent: 'Kinoteka test',
    fallbackDir: join(root, 'app-subtitles'),
    conversionDir: join(root, 'cache')
  })
  return { service, settings }
}

describe('OnlineSubtitlesService', () => {
  it('bez klíče nehledá a poradí, kde ho nastavit', async () => {
    const { service } = setup()
    expect(service.status()).toEqual({ configured: false, username: null })
    expect(await service.search({ path: 'C:\\x.mkv', library: null }, ['cs'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('Nastavení → Titulky')
    })
  })

  it('klíč se před uložením ověří; neplatný se neuloží', async () => {
    const bad = setup(vi.fn(async () => json({}, 403)))
    expect(await bad.service.save({ apiKey: 'spatny', username: '', password: '' })).toMatchObject({
      ok: false
    })
    expect(bad.service.status().configured).toBe(false)

    const good = setup()
    expect(await good.service.save({ apiKey: 'klic', username: '', password: '' })).toEqual({
      ok: true
    })
    expect(good.service.status()).toEqual({ configured: true, username: null })
  })

  it('hledá díl podle ID seriálu, série a dílu; čeština první', async () => {
    const fetchImpl = fakeApi()
    const { service } = setup(fetchImpl)
    await service.save({ apiKey: 'klic', username: '', password: '' })
    const result = await service.search(
      {
        path: join(root, 'neexistuje.mkv'),
        library: {
          kind: 'show',
          name: 'MobLand',
          year: 2025,
          tmdbId: 247718,
          imdbId: 'tt31510819',
          season: 1,
          episode: 2
        }
      },
      ['cs', 'en']
    )
    expect(result).toMatchObject({ ok: true, query: 'MobLand S01E02' })
    expect(result.ok && result.subtitles.map((s) => s.fileId)).toEqual([1, 2])
    const url = String(fetchImpl.mock.calls.at(-1)![0])
    expect(url).toContain('parent_tmdb_id=247718')
    expect(url).toContain('season_number=1')
    expect(url).not.toContain('query=')
  })

  it('stažené titulky uloží vedle filmu jako Film.cs.srt a převede kódování', async () => {
    const { service } = setup()
    await service.save({ apiKey: 'klic', username: '', password: '' })
    const video = join(root, 'Film (2020).mkv')
    await writeFile(video, 'x')
    await writeFile(join(root, 'Film (2020).cs.srt'), 'starší titulky')
    await service.search({ path: video, library: null }, ['cs'])

    const { result, subtitle } = await service.download(1, video)
    expect(result).toEqual({
      ok: true,
      savedTo: 'video-folder',
      fileName: 'Film (2020).cs.2.srt',
      remaining: 4
    })
    expect(subtitle).toMatchObject({ language: 'cs', encoding: 'windows-1250' })
    expect(await readFile(subtitle!.path, 'utf8')).toBe('1\nPříliš\n')
  })

  it('když do složky s filmem nejde zapisovat, uloží je do dat aplikace a příště je najde', async () => {
    const { service } = setup()
    await service.save({ apiKey: 'klic', username: '', password: '' })
    const video = join(root, 'jen-pro-cteni', 'Film.mkv') // složka neexistuje → zápis selže
    const { result } = await service.download(2, video)
    expect(result).toMatchObject({ ok: true, savedTo: 'app-data' })
    expect(await findDownloadedSubtitles(join(root, 'app-subtitles'), video)).toHaveLength(1)
  })
})
