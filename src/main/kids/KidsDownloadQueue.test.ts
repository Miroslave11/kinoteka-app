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

function setup(options: { have?: string[]; titles?: string[] } = {}) {
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
    scan
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
