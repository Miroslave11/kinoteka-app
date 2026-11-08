import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { YtLibrary, type FetchInfoResult } from './YtLibrary'
import { YtRepository } from './YtRepository'

let root: string
let yt: string
let repository: YtRepository

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-ytlib-'))
  yt = join(root, 'YT')
  repository = new YtRepository(openDatabase(':memory:'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Video stažené yt-dlp: mp4, obrázek a (volitelně) údaje z YouTube vedle sebe. */
async function downloaded(
  dir: string,
  name: string,
  id: string,
  info: Record<string, unknown> | null
): Promise<string> {
  await mkdir(dir, { recursive: true })
  const base = join(dir, `${name} [${id}]`)
  await writeFile(`${base}.mp4`, `video ${id}`)
  await writeFile(`${base}.jpg`, 'jpg')
  if (info) await writeFile(`${base}.info.json`, JSON.stringify({ id, ...info }))
  return `${base}.mp4`
}

function library(
  fetchInfo?: (id: string) => Promise<FetchInfoResult>,
  downloadingInto?: string,
  extra: { busy?: () => boolean } = {}
): YtLibrary {
  return new YtLibrary(repository, {
    folder: () => yt,
    fetchInfo,
    busy: extra.busy,
    fetchThumbnail: vi.fn(async () => new Uint8Array([1, 2, 3])),
    trash: async (path) => {
      await mkdir(join(root, 'Koš'), { recursive: true })
      await rename(path, join(root, 'Koš', basename(path)))
    },
    downloadingInto: (folder) => folder === downloadingInto,
    probeDuration: vi.fn(async () => 42),
    makeThumbnail: vi.fn(async (_input: string, _at: number, output: string) => {
      await writeFile(output, 'frame')
    }),
    thumbnailDir: join(root, 'cache')
  })
}

const summary = (): [string, string[]][] =>
  repository
    .list()
    .filter((c) => c.videos.length > 0)
    .map((c) => [c.name, c.videos.map((v) => v.name).sort()])

describe('YtLibrary', () => {
  it('v prázdné složce založí výchozí kategorie', async () => {
    const result = await library().scan()
    expect(result).toMatchObject({ categories: 5, videos: 0, sorted: 0, errors: [] })
    expect((await readdir(yt)).sort()).toEqual(
      ['Hudební klipy', 'Koncerty a živě', 'Města', 'Ostatní', 'Příroda'].sort()
    )
    expect(repository.list().map((c) => [c.name, c.role])).toEqual([
      ['Města', null],
      ['Příroda', null],
      ['Koncerty a živě', null],
      ['Hudební klipy', 'music'],
      ['Ostatní', 'other']
    ])
  })

  it('videa z kořene zařadí podle obsahu a přesune i s obrázkem a údaji', async () => {
    await library().scan()
    await downloaded(yt, 'Tokyo Night Walk', 'aaaaaaaaaaa', {
      title: 'Tokyo Night Walk',
      tags: ['lofi'],
      categories: ['Music']
    })
    await downloaded(yt, 'Fjords', 'bbbbbbbbbbb', {
      title: 'Fjords',
      tags: ['nature', 'drone'],
      categories: ['Travel & Events']
    })
    await downloaded(yt, 'Song', 'ccccccccccc', { title: 'Song', categories: ['Music'] })
    await downloaded(yt, 'Podcast', 'ddddddddddd', { title: 'Podcast', categories: ['Education'] })

    const result = await library().scan()

    expect(result).toMatchObject({ videos: 4, sorted: 4, errors: [] })
    expect(summary()).toEqual([
      ['Města', ['Tokyo Night Walk']],
      ['Příroda', ['Fjords']],
      ['Hudební klipy', ['Song']],
      ['Ostatní', ['Podcast']]
    ])
    expect((await readdir(join(yt, 'Města'))).sort()).toEqual([
      'Tokyo Night Walk [aaaaaaaaaaa].info.json',
      'Tokyo Night Walk [aaaaaaaaaaa].jpg',
      'Tokyo Night Walk [aaaaaaaaaaa].mp4'
    ])
  })

  it('video dostažené během procházení zařadí hned další procházení', async () => {
    const lib = library()
    await lib.scan()
    const first = lib.scan()
    // Video dorazí, když první procházení už běží – druhé volání ho nesmí přehlédnout.
    await downloaded(yt, 'Song', 'ccccccccccc', { title: 'Song', categories: ['Music'] })
    const second = lib.scan()
    const third = lib.scan()
    expect(third).toBe(second)
    await first
    expect(second).not.toBe(first)
    expect(await second).toMatchObject({ videos: 1, errors: [] })
    expect(summary().flatMap(([, names]) => names)).toEqual(['Song'])
  })

  it('už zařazená videa nepřesouvá, podsložka uživatele je kategorie', async () => {
    await downloaded(join(yt, 'Oblíbené'), 'Paris', 'aaaaaaaaaaa', {
      title: 'Paris',
      tags: ['paris', 'city']
    })
    await library().scan()
    expect(summary()).toEqual([['Oblíbené', ['Paris']]])
    // Složka už podsložku má – výchozí kategorie se nezakládají.
    expect(await readdir(yt)).toEqual(['Oblíbené'])
  })

  it('chybějící záložní kategorii založí, když je potřeba', async () => {
    await mkdir(join(yt, 'Příroda'), { recursive: true })
    await downloaded(yt, 'Talk', 'aaaaaaaaaaa', { title: 'Talk' })
    await library().scan()
    expect(summary()).toEqual([['Ostatní', ['Talk']]])
    expect(repository.list().find((c) => c.name === 'Ostatní')?.role).toBe('other')
  })

  it('videu bez údajů je dotáhne z YouTube podle ID a pak ho zařadí', async () => {
    await library().scan()
    const path = await downloaded(yt, 'Something', 'aaaaaaaaaaa', null)
    const fetchInfo = vi.fn(async (): Promise<FetchInfoResult> => ({
      ok: true,
      info: {
        id: 'aaaaaaaaaaa',
        title: 'Ocean Waves',
        tags: ['ocean', 'beach'],
        formats: ['velký seznam'],
        categories: ['Music']
      }
    }))
    const lib = library(fetchInfo)

    await lib.scan()
    expect(summary()).toEqual([['Čeká na zařazení', ['Something']]])
    expect(lib.pendingInfo).toBe(1)
    await lib.idle()

    expect(fetchInfo).toHaveBeenCalledWith('aaaaaaaaaaa')
    expect(summary()).toEqual([['Příroda', ['Ocean Waves']]])
    const saved = JSON.parse(
      await readFile(join(yt, 'Příroda', 'Something [aaaaaaaaaaa].info.json'), 'utf8')
    ) as Record<string, unknown>
    expect(saved['tags']).toEqual(['ocean', 'beach'])
    expect(saved['formats']).toBeUndefined()
    expect(existsSync(path)).toBe(false)
  })

  it('video, které YouTube nemá, zařadí podle názvu souboru', async () => {
    await library().scan()
    await downloaded(yt, 'Praha v noci', 'aaaaaaaaaaa', null)
    const lib = library(async () => ({ ok: false, retry: false, message: 'smazané' }))
    await lib.scan()
    await lib.idle()
    expect(summary()).toEqual([['Města', ['Praha v noci']]])
  })

  it('bez připojení video nechá v kořeni a zkusí to příště', async () => {
    await library().scan()
    await downloaded(yt, 'Praha v noci', 'aaaaaaaaaaa', null)
    await downloaded(yt, 'Jiné', 'bbbbbbbbbbb', null)
    const fetchInfo = vi.fn(async (): Promise<FetchInfoResult> => ({
      ok: false,
      retry: true,
      message: 'offline'
    }))
    const lib = library(fetchInfo)
    await lib.scan()
    await lib.idle()
    // Po první chybě spojení se další nezkouší.
    expect(fetchInfo).toHaveBeenCalledTimes(1)
    expect(summary()).toEqual([['Čeká na zařazení', ['Jiné', 'Praha v noci']]])
  })

  it('soubory bez ID (odjinud) zařadí jen podle názvu', async () => {
    await library().scan()
    await writeFile(join(yt, 'Koncert Wembley live.mp4'), 'x')
    const fetchInfo = vi.fn()
    await library(fetchInfo).scan()
    expect(fetchInfo).not.toHaveBeenCalled()
    expect(summary()).toEqual([['Koncerty a živě', ['Koncert Wembley live']]])
  })

  it('nová kategorie a klíčová slova (při shodě vyhraje vlastní kategorie)', async () => {
    const lib = library()
    await lib.scan()
    expect(await lib.manage({ kind: 'create-category', name: 'Pláže' })).toEqual({ ok: true })
    expect(await lib.manage({ kind: 'create-category', name: 'pláže' })).toMatchObject({
      ok: false
    })
    const id = repository.list().find((c) => c.name === 'Pláže')!.id!
    await lib.manage({ kind: 'set-keywords', categoryId: id, keywords: ['beach'] })

    await downloaded(yt, 'Sunny', 'aaaaaaaaaaa', { title: 'Sunny', tags: ['beach'] })
    await lib.scan()
    expect(summary()).toEqual([['Pláže', ['Sunny']]])
  })

  it('smazaná podsložka zmizí i s videi', async () => {
    await downloaded(join(yt, 'Města'), 'Paris', 'aaaaaaaaaaa', { title: 'Paris' })
    await library().scan()
    await rm(join(yt, 'Města'), { recursive: true })
    await mkdir(join(yt, 'Příroda'))
    await library().scan()
    expect(repository.list().map((c) => c.name)).toEqual(['Příroda'])
  })

  it('rozpracované soubory yt-dlp nechá být', async () => {
    await library().scan()
    await writeFile(join(yt, 'Clip [aaaaaaaaaaa].f137.mp4'), 'x')
    const result = await library().scan()
    expect(result.videos).toBe(0)
    expect(existsSync(join(yt, 'Clip [aaaaaaaaaaa].f137.mp4'))).toBe(true)
  })
})

describe('YtRepository – přehrávání', () => {
  it('pozice, zhlédnutí, pořadí ve frontě (nejnovější první)', async () => {
    await downloaded(join(yt, 'Města'), 'A', 'aaaaaaaaaaa', { title: 'A' })
    await library().scan()
    await downloaded(join(yt, 'Města'), 'B', 'bbbbbbbbbbb', { title: 'B' })
    await library().scan()
    const [b, a] = repository.list().find((c) => c.name === 'Města')!.videos
    expect([b!.name, a!.name]).toEqual(['B', 'A'])
    expect(repository.queue(a!.id).map((v) => v.name)).toEqual(['B', 'A'])

    expect(repository.record(a!.id, 60, 200)).toBe('progress')
    expect(repository.list()[0]!.videos.find((v) => v.id === a!.id)?.progress).toBeCloseTo(0.3)
    expect(repository.record(a!.id, 195, 200)).toBe('watched')
    const after = repository.list()[0]!.videos.find((v) => v.id === a!.id)!
    expect([after.progress, after.watched]).toEqual([null, true])

    repository.record(b!.id, 60, 200)
    repository.clearProgress(b!.id)
    expect(repository.progress(b!.id)).toBeNull()
  })
})

describe('YtLibrary – správa', () => {
  const idOf = (name: string): number => repository.list().find((c) => c.name === name)!.id!
  const videoId = (name: string): number =>
    repository
      .list()
      .flatMap((c) => c.videos)
      .find((v) => v.name === name)!.id

  it('přesun videa do jiné kategorie i s obrázkem a údaji, pozice zůstane', async () => {
    const lib = library()
    await lib.scan()
    await downloaded(join(yt, 'Města'), 'Clip', 'aaaaaaaaaaa', { title: 'Clip' })
    await lib.scan()
    repository.record(videoId('Clip'), 80, 200)

    expect(
      await lib.manage({
        kind: 'move-video',
        videoId: videoId('Clip'),
        categoryId: idOf('Příroda')
      })
    ).toEqual({ ok: true })
    expect(summary()).toEqual([['Příroda', ['Clip']]])
    expect((await readdir(join(yt, 'Příroda'))).sort()).toEqual([
      'Clip [aaaaaaaaaaa].info.json',
      'Clip [aaaaaaaaaaa].jpg',
      'Clip [aaaaaaaaaaa].mp4'
    ])
    expect(repository.progress(videoId('Clip'))?.position).toBe(80)
  })

  it('přejmenování kategorie přejmenuje složku, videa zůstanou', async () => {
    const lib = library()
    await lib.scan()
    await downloaded(join(yt, 'Města'), 'Clip', 'aaaaaaaaaaa', { title: 'Clip' })
    await lib.scan()
    const before = videoId('Clip')
    expect(
      await lib.manage({ kind: 'rename-category', categoryId: idOf('Města'), name: 'Velkoměsta' })
    ).toEqual({ ok: true })
    expect(existsSync(join(yt, 'Velkoměsta', 'Clip [aaaaaaaaaaa].mp4'))).toBe(true)
    expect(summary()).toEqual([['Velkoměsta', ['Clip']]])
    expect(videoId('Clip')).toBe(before)
    // Další sken nic nerozbije (kategorie i video se najdou na novém místě).
    await lib.scan()
    expect(summary()).toEqual([['Velkoměsta', ['Clip']]])
  })

  it('přejmenování na existující kategorii nejde', async () => {
    const lib = library()
    await lib.scan()
    expect(
      await lib.manage({ kind: 'rename-category', categoryId: idOf('Města'), name: 'Příroda' })
    ).toMatchObject({ ok: false })
  })

  it('smazání kategorie: videa se znovu zařadí, složka zmizí', async () => {
    const lib = library()
    await lib.scan()
    await downloaded(join(yt, 'Koncerty a živě'), 'Ocean', 'aaaaaaaaaaa', {
      title: 'Ocean',
      tags: ['ocean']
    })
    await downloaded(join(yt, 'Koncerty a živě'), 'Talk', 'bbbbbbbbbbb', { title: 'Talk' })
    await lib.scan()
    expect(
      await lib.manage({ kind: 'delete-category', categoryId: idOf('Koncerty a živě') })
    ).toEqual({ ok: true })
    expect(existsSync(join(yt, 'Koncerty a živě'))).toBe(false)
    expect(summary()).toEqual([
      ['Příroda', ['Ocean']],
      ['Ostatní', ['Talk']]
    ])
  })

  it('záložní kategorii ani kategorii, kam se stahuje, nejde smazat', async () => {
    await library().scan()
    expect(
      await library().manage({ kind: 'delete-category', categoryId: idOf('Ostatní') })
    ).toMatchObject({ ok: false })
    expect(
      await library(undefined, 'Města').manage({
        kind: 'delete-category',
        categoryId: idOf('Města')
      })
    ).toMatchObject({ ok: false })
    expect(existsSync(join(yt, 'Města'))).toBe(true)
  })

  it('smazání videa do Koše i s obrázkem a údaji', async () => {
    const lib = library()
    await lib.scan()
    await downloaded(join(yt, 'Města'), 'Clip', 'aaaaaaaaaaa', { title: 'Clip' })
    await lib.scan()
    expect(await lib.manage({ kind: 'trash-video', videoId: videoId('Clip') })).toEqual({
      ok: true
    })
    expect(summary()).toEqual([])
    expect((await readdir(join(root, 'Koš'))).sort()).toEqual([
      'Clip [aaaaaaaaaaa].info.json',
      'Clip [aaaaaaaaaaa].jpg',
      'Clip [aaaaaaaaaaa].mp4'
    ])
  })
})

describe('YtLibrary – online videa', () => {
  const info = (id: string, title: string, tags: string[]): FetchInfoResult => ({
    ok: true,
    info: { id, title, tags, duration: 245, channel: 'Kanál', formats: ['velké'] }
  })

  it('přidání online „automaticky“: odkaz do kořene, údaje z YouTube, zařazení podle obsahu', async () => {
    const fetchInfo = vi.fn(async (id: string) => info(id, 'Ocean Waves', ['ocean', 'beach']))
    const lib = library(fetchInfo)
    await lib.scan()

    const result = await lib.addOnline([{ youtubeId: 'aaaaaaaaaaa', title: 'Ocean | Waves' }], '')
    expect(result).toEqual({ added: 1, skipped: 0 })
    await lib.idle()

    expect(summary()).toEqual([['Příroda', ['Ocean Waves']]])
    expect((await readdir(join(yt, 'Příroda'))).sort()).toEqual([
      'Ocean Waves [aaaaaaaaaaa].info.json',
      'Ocean Waves [aaaaaaaaaaa].jpg',
      'Ocean Waves [aaaaaaaaaaa].ytonline'
    ])
    const video = repository.list().flatMap((c) => c.videos)[0]!
    expect(video).toMatchObject({ online: true, youtubeId: 'aaaaaaaaaaa', durationSec: 245 })
    const link = JSON.parse(
      await readFile(join(yt, 'Příroda', 'Ocean Waves [aaaaaaaaaaa].ytonline'), 'utf8')
    ) as Record<string, unknown>
    expect(link['url']).toBe('https://www.youtube.com/watch?v=aaaaaaaaaaa')
  })

  it('přidání do vybrané kategorie: hned tam, údaje se dotáhnou na pozadí', async () => {
    const fetchInfo = vi.fn(async (id: string) => info(id, 'Song', ['nature']))
    const lib = library(fetchInfo)
    await lib.scan()
    await lib.addOnline([{ youtubeId: 'bbbbbbbbbbb', title: 'Song' }], 'Města')
    expect(summary()).toEqual([['Města', ['Song']]])
    await vi.waitFor(() =>
      expect(repository.list().flatMap((c) => c.videos)[0]?.channel).toBe('Kanál')
    )
    // Zůstane, kam ho uživatel dal (štítky přírody nevadí).
    expect(summary()).toEqual([['Města', ['Song']]])
  })

  it('už přidané nebo stažené video se znovu nepřidá; online video se nesnímkuje ffmpegem', async () => {
    const lib = library()
    await lib.scan()
    await downloaded(join(yt, 'Města'), 'Clip', 'aaaaaaaaaaa', { title: 'Clip' })
    await lib.scan()
    expect(
      await lib.addOnline(
        [
          { youtubeId: 'aaaaaaaaaaa', title: 'Clip' },
          { youtubeId: 'ccccccccccc', title: 'Nové' },
          { youtubeId: 'ccccccccccc', title: 'Nové' }
        ],
        'Města'
      )
    ).toEqual({ added: 1, skipped: 2 })
    const online = repository
      .list()
      .flatMap((c) => c.videos)
      .find((v) => v.online)!
    expect(online.name).toBe('Nové')
    expect(online.thumbnailUrl).not.toBeNull()
  })

  it('během stahování se kořen netřídí', async () => {
    let busy = true
    const lib = library(undefined, undefined, { busy: () => busy })
    await lib.scan()
    await downloaded(yt, 'Paris', 'aaaaaaaaaaa', { title: 'Paris', tags: ['paris'] })
    await lib.scan()
    expect(existsSync(join(yt, 'Paris [aaaaaaaaaaa].mp4'))).toBe(true)
    busy = false
    await lib.scan()
    expect(summary()).toEqual([['Města', ['Paris']]])
  })

  it('online video jde přesunout i smazat jako stažené', async () => {
    const lib = library()
    await lib.scan()
    await lib.addOnline([{ youtubeId: 'ddddddddddd', title: 'Klip' }], 'Města')
    const id = repository.list().flatMap((c) => c.videos)[0]!.id
    const priroda = repository.list().find((c) => c.name === 'Příroda')!.id!
    expect(await lib.manage({ kind: 'move-video', videoId: id, categoryId: priroda })).toEqual({
      ok: true
    })
    expect(existsSync(join(yt, 'Příroda', 'Klip [ddddddddddd].ytonline'))).toBe(true)
    expect(await lib.manage({ kind: 'trash-video', videoId: id })).toEqual({ ok: true })
    expect((await readdir(join(root, 'Koš'))).sort()).toEqual([
      'Klip [ddddddddddd].jpg',
      'Klip [ddddddddddd].ytonline'
    ])
  })
})

describe('YtLibrary – převody (O3)', () => {
  const videos = () => repository.list().flatMap((c) => c.videos)

  it('Ponechat jen online: soubor do Koše, zůstane odkaz, pozice i obrázek; vrátí uvolněné místo', async () => {
    const lib = library()
    await lib.scan()
    await downloaded(join(yt, 'Města'), 'Clip', 'aaaaaaaaaaa', { title: 'Clip', duration: 200 })
    await lib.scan()
    const before = videos()[0]!
    repository.record(before.id, 80, 200)

    const result = await lib.manage({ kind: 'keep-online', videoId: before.id })
    expect(result).toEqual({ ok: true, freedBytes: 'video aaaaaaaaaaa'.length })
    expect((await readdir(join(yt, 'Města'))).sort()).toEqual([
      'Clip [aaaaaaaaaaa].info.json',
      'Clip [aaaaaaaaaaa].jpg',
      'Clip [aaaaaaaaaaa].ytonline'
    ])
    expect(await readdir(join(root, 'Koš'))).toEqual(['Clip [aaaaaaaaaaa].mp4'])
    const after = videos()[0]!
    expect(after).toMatchObject({ id: before.id, online: true, sizeBytes: 0, durationSec: 200 })
    expect(repository.progress(before.id)?.position).toBe(80)
    // Další sken nic nezdvojí.
    await lib.scan()
    expect(videos()).toHaveLength(1)
  })

  it('video bez ID z YouTube online ponechat nejde', async () => {
    const lib = library()
    await lib.scan()
    await mkdir(join(yt, 'Města'), { recursive: true })
    await writeFile(join(yt, 'Města', 'vlastni.mp4'), 'x')
    await lib.scan()
    expect(await lib.manage({ kind: 'keep-online', videoId: videos()[0]!.id })).toMatchObject({
      ok: false
    })
    expect(existsSync(join(yt, 'Města', 'vlastni.mp4'))).toBe(true)
  })

  it('celá kategorie: převede jen stažená videa s odkazem, sečte uvolněné místo', async () => {
    const lib = library()
    await lib.scan()
    await downloaded(join(yt, 'Města'), 'A', 'aaaaaaaaaaa', { title: 'A' })
    await downloaded(join(yt, 'Města'), 'B', 'bbbbbbbbbbb', { title: 'B' })
    await writeFile(join(yt, 'Města', 'vlastni.mp4'), 'x')
    await lib.scan()
    const id = repository.list().find((c) => c.name === 'Města')!.id!
    const result = await lib.manage({ kind: 'keep-online-category', categoryId: id })
    expect(result).toEqual({ ok: true, freedBytes: 2 * 'video aaaaaaaaaaa'.length })
    expect(
      videos()
        .map((v) => [v.name, v.online])
        .sort()
    ).toEqual([
      ['A', true],
      ['B', true],
      ['vlastni', false]
    ])
  })

  it('Stáhnout do počítače: stažený soubor převezme záznam odkazu (pozice zůstane), odkaz zmizí', async () => {
    const lib = library()
    await lib.scan()
    await lib.addOnline([{ youtubeId: 'ccccccccccc', title: 'Online klip' }], 'Příroda')
    const online = videos()[0]!
    repository.record(online.id, 90, 300)
    expect(repository.categoryOfYoutubeId('ccccccccccc', true)).toBeNull()
    expect(repository.categoryOfYoutubeId('ccccccccccc')).toBe('Příroda')

    // yt-dlp stáhne video do stejné kategorie (pod svým názvem).
    await downloaded(join(yt, 'Příroda'), 'Online klip (Official)', 'ccccccccccc', {
      title: 'Online klip (Official)'
    })
    await lib.scan()

    expect(videos()).toHaveLength(1)
    expect(videos()[0]).toMatchObject({
      id: online.id,
      online: false,
      name: 'Online klip (Official)'
    })
    expect(repository.progress(online.id)?.position).toBe(90)
    expect((await readdir(join(yt, 'Příroda'))).sort()).toEqual([
      'Online klip (Official) [ccccccccccc].info.json',
      'Online klip (Official) [ccccccccccc].jpg',
      'Online klip (Official) [ccccccccccc].mp4'
    ])
    expect(repository.categoryOfYoutubeId('ccccccccccc', true)).toBe('Příroda')
  })

  it('nedostupné video: štítek se uloží a přežije sken', async () => {
    const lib = library()
    await lib.scan()
    await lib.addOnline([{ youtubeId: 'ddddddddddd', title: 'Smazané' }], 'Města')
    repository.setUnavailable(videos()[0]!.id, true)
    await lib.scan()
    expect(videos()[0]!.unavailable).toBe(true)
  })
})
