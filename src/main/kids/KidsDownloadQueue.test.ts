import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KidsDownloadResult } from '../../shared/kids'
import { KidsDownloadQueue, removePartialFiles } from './KidsDownloadQueue'
import type { VideoInfo } from './ytdlp'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-queue-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const PEPPA_VIDEO: VideoInfo = {
  title: 'Bláto | Prasátko Peppa',
  channel: 'Prasátko Peppa - Oficiální kanál',
  durationSec: 312,
  entries: []
}
const PLAYLIST: VideoInfo = {
  title: 'Peppa – celá série 1',
  channel: 'Prasátko Peppa - Oficiální kanál',
  durationSec: null,
  entries: [
    { id: 'aaaaaaaaaaa', title: 'Bláto' },
    { id: 'bbbbbbbbbbb', title: 'Výlet' },
    { id: 'ccccccccccc', title: 'Narozeniny' }
  ]
}

function setup(
  options: {
    have?: string[]
    titles?: string[]
    quick?: (id: string) => Promise<VideoInfo | null>
  } = {}
) {
  const downloader = Object.assign(new EventEmitter(), {
    info: vi.fn(async (url: string, _playlist: boolean) =>
      url.includes('playlist') ? PLAYLIST : PEPPA_VIDEO
    ),
    download: vi.fn(async (url: string, _options?: object): Promise<KidsDownloadResult> => ({
      ok: true,
      title: `Staženo ${url.slice(-11)}`,
      channel: null,
      durationSec: 1,
      fileName: 'x.mp4',
      thumbnail: null
    })),
    cancel: vi.fn()
  })
  const scan = vi.fn(async () => undefined)
  const queue = new KidsDownloadQueue({
    downloader,
    repository: {
      videoByYoutubeId: (id: string) =>
        options.have?.includes(id) ? { id: 1, title: 'Prasátko Peppa' } : null,
      titles: () =>
        (options.titles ?? []).map((folder, i) => ({
          id: i + 1,
          folder,
          keywords: [],
          coverVideoId: null,
          coverImage: null,
          tmdb: { status: 'none' as const, kind: null, id: null, name: null, year: null },
          artwork: []
        }))
    },
    folder: () => root,
    scan,
    quickInfo: options.quick
  })
  return { queue, downloader, scan }
}

describe('KidsDownloadQueue', () => {
  it('náhled videa: navrhne nový titul podle kanálu, nabídne celý playlist', async () => {
    const { queue } = setup()
    const result = await queue.preview({ videoId: 'aaaaaaaaaaa', playlistId: 'PLpeppa12345' })
    expect(result).toEqual({
      ok: true,
      preview: {
        kind: 'video',
        videoId: 'aaaaaaaaaaa',
        title: 'Bláto | Prasátko Peppa',
        channel: 'Prasátko Peppa - Oficiální kanál',
        durationSec: 312,
        thumbnailUrl: 'kinoteka-media://ytthumb/aaaaaaaaaaa',
        playlist: { id: 'PLpeppa12345', title: 'Peppa – celá série 1', count: 3 },
        suggestedTitle: 'Prasátko Peppa',
        suggestedExisting: false,
        alreadyIn: null
      }
    })
  })

  it('náhled: existující titul podle klíčových slov, video už ve složce', async () => {
    const { queue } = setup({ titles: ['Prasátko Peppa'], have: ['aaaaaaaaaaa'] })
    const result = await queue.preview({ videoId: 'aaaaaaaaaaa', playlistId: null })
    expect(result).toMatchObject({
      ok: true,
      preview: {
        suggestedTitle: 'Prasátko Peppa',
        suggestedExisting: true,
        alreadyIn: 'Prasátko Peppa'
      }
    })
  })

  it('náhled videa nejdřív rychle přes oEmbed (bez yt-dlp), playlist přes yt-dlp', async () => {
    const quick = vi.fn(async () => ({ ...PEPPA_VIDEO, durationSec: null }))
    const { queue, downloader } = setup({ quick })
    const stages: string[] = []
    const result = await queue.preview(
      { videoId: 'aaaaaaaaaaa', playlistId: 'PLpeppa12345' },
      (s) => stages.push(s)
    )
    expect(result).toMatchObject({
      ok: true,
      preview: { title: 'Bláto | Prasátko Peppa', durationSec: null, playlist: { count: 3 } }
    })
    expect(quick).toHaveBeenCalledWith('aaaaaaaaaaa')
    expect(downloader.info).toHaveBeenCalledTimes(1)
    expect(downloader.info.mock.calls[0]![0]).toContain('playlist')
    expect(stages[0]).toBe('quick')
  })

  it('nový náhled zruší předchozí (dva yt-dlp nikdy vedle sebe)', async () => {
    const { queue, downloader } = setup({ quick: async () => null })
    const signals: AbortSignal[] = []
    downloader.info.mockImplementation(
      (_url: string, _playlist: boolean, _onStage?: unknown, signal?: AbortSignal) => {
        signals.push(signal!)
        if (signals.length > 1) return Promise.resolve(PEPPA_VIDEO)
        return new Promise((_resolve, reject) =>
          signal!.addEventListener('abort', () => reject(new Error('Náhled byl zrušen.')))
        )
      }
    )
    const stages: string[] = []
    const first = queue.preview({ videoId: 'aaaaaaaaaaa', playlistId: null }, (s) =>
      stages.push(`1:${s}`)
    )
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    const second = await queue.preview({ videoId: 'bbbbbbbbbbb', playlistId: null })
    expect(await first).toEqual({ ok: false, message: 'Náhled byl zrušen.' })
    expect(signals[0]!.aborted).toBe(true)
    expect(second).toMatchObject({ ok: true, preview: { title: 'Bláto | Prasátko Peppa' } })
    expect(signals[1]!.aborted).toBe(false)
  })

  it('oEmbed video nezná → náhled přes yt-dlp', async () => {
    const { queue, downloader } = setup({ quick: async () => null })
    const result = await queue.preview({ videoId: 'aaaaaaaaaaa', playlistId: null })
    expect(result).toMatchObject({ ok: true, preview: { durationSec: 312 } })
    expect(downloader.info).toHaveBeenCalledTimes(1)
  })

  it('chyba náhledu → srozumitelná zpráva', async () => {
    const { queue, downloader } = setup()
    downloader.info.mockRejectedValueOnce(
      new Error('Video není dostupné (smazané nebo blokované).')
    )
    expect(await queue.preview({ videoId: 'aaaaaaaaaaa', playlistId: null })).toEqual({
      ok: false,
      message: 'Video není dostupné (smazané nebo blokované).'
    })
  })

  it('playlist: přeskočí stažená, ostatní stáhne postupně do složky titulu', async () => {
    const { queue, downloader, scan } = setup({ have: ['bbbbbbbbbbb'] })
    await queue.preview({ videoId: null, playlistId: 'PLpeppa12345' })
    const result = await queue.enqueue({
      kind: 'playlist',
      videoId: null,
      playlistId: 'PLpeppa12345',
      title: 'Prasátko: Peppa?',
      quality: '720'
    })
    expect(result).toEqual({ ok: true, added: 2, skipped: 1 })
    await vi.waitFor(() => expect(queue.items.every((i) => i.status === 'done')).toBe(true))
    expect(downloader.download.mock.calls.map(([url, options]) => [url, options])).toEqual([
      [
        'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        { folder: join(root, 'Prasátko Peppa'), quality: '720' }
      ],
      [
        'https://www.youtube.com/watch?v=ccccccccccc',
        { folder: join(root, 'Prasátko Peppa'), quality: '720' }
      ]
    ])
    expect(scan).toHaveBeenCalledTimes(2)
    expect(queue.items.map((i) => i.name)).toEqual(['Staženo aaaaaaaaaaa', 'Staženo ccccccccccc'])
    queue.clearFinished()
    expect(queue.items).toEqual([])
  })

  it('chyba jednoho videa nezastaví frontu; stejné video se nezařadí dvakrát', async () => {
    const { queue, downloader } = setup()
    let fail: (result: KidsDownloadResult) => void = () => undefined
    downloader.download.mockImplementationOnce(
      () => new Promise<KidsDownloadResult>((resolve) => (fail = resolve))
    )
    const request = {
      kind: 'video' as const,
      videoId: 'aaaaaaaaaaa',
      playlistId: null,
      title: 'Peppa',
      quality: '1080' as const
    }
    await queue.enqueue(request)
    expect(await queue.enqueue(request)).toMatchObject({ added: 0, skipped: 1 })
    await queue.enqueue({ ...request, videoId: 'ccccccccccc' })
    fail({ ok: false, message: 'Video je soukromé.' })
    await vi.waitFor(() => expect(queue.items.map((i) => i.status)).toEqual(['error', 'done']))
    expect(queue.items[0]!.message).toBe('Video je soukromé.')
  })
})

describe('removePartialFiles', () => {
  it('smaže rozpracované soubory i obrázek a údaje nedokončeného videa, cizí nechá', async () => {
    const folder = join(root, 'Peppa')
    await mkdir(folder)
    const names = [
      'Bláto [aaaaaaaaaaa].f398.mp4.part',
      'Bláto [aaaaaaaaaaa].info.json',
      'Bláto [aaaaaaaaaaa].jpg',
      'Výlet [bbbbbbbbbbb].mp4',
      'Výlet [bbbbbbbbbbb].jpg'
    ]
    for (const name of names) await writeFile(join(folder, name), 'x')
    await removePartialFiles(folder, 'aaaaaaaaaaa')
    expect(names.map((name) => existsSync(join(folder, name)))).toEqual([
      false,
      false,
      false,
      true,
      true
    ])
  })
})

describe('KidsDownloadQueue – YT videa (vlastní návrh, stažení do kořene)', () => {
  function ytSetup(have: string[] = []) {
    const downloader = Object.assign(new EventEmitter(), {
      info: vi.fn(async () => PEPPA_VIDEO),
      download: vi.fn(async (url: string, _options?: object): Promise<KidsDownloadResult> => ({
        ok: true,
        title: `Staženo ${url.slice(-11)}`,
        channel: null,
        durationSec: 1,
        fileName: 'x.mp4',
        thumbnail: null
      })),
      cancel: vi.fn()
    })
    const queue = new KidsDownloadQueue({
      downloader,
      folder: () => root,
      suggest: (meta) => ({
        name: meta.title.includes('Bláto') ? 'Příroda' : null,
        existing: true
      }),
      alreadyIn: (id) => (have.includes(id) ? 'Města' : null),
      scan: vi.fn(async () => undefined)
    })
    return { queue, downloader }
  }

  it('návrh a „už staženo“ z vlastních funkcí', async () => {
    const { queue } = ytSetup(['aaaaaaaaaaa'])
    const result = await queue.preview({ videoId: 'aaaaaaaaaaa', playlistId: null })
    expect(result).toMatchObject({
      ok: true,
      preview: { suggestedTitle: 'Příroda', suggestedExisting: true, alreadyIn: 'Města' }
    })
  })

  it('prázdný název = stáhnout do kořenové složky', async () => {
    const { queue, downloader } = ytSetup()
    await queue.enqueue({
      kind: 'video',
      videoId: 'bbbbbbbbbbb',
      playlistId: null,
      title: '',
      quality: '2160'
    })
    await vi.waitFor(() => expect(queue.items[0]?.status).toBe('done'))
    expect(queue.items[0]?.title).toBe('')
    expect(downloader.download).toHaveBeenCalledWith(expect.stringContaining('bbbbbbbbbbb'), {
      folder: root,
      quality: '2160'
    })
  })
})
