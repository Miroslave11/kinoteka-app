import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

function library(fetchInfo?: (id: string) => Promise<FetchInfoResult>): YtLibrary {
  return new YtLibrary(repository, {
    folder: () => yt,
    fetchInfo,
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
