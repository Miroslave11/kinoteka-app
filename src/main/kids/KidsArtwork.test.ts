import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { TmdbError } from '../metadata/TmdbClient'
import type { TmdbApi } from '../metadata/MetadataService'
import { cleanChannel, KidsArtwork, pickArtwork } from './KidsArtwork'
import { KidsLibrary } from './KidsLibrary'
import { KidsRepository } from './KidsRepository'

let root: string
let repository: KidsRepository

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-kidsart-'))
  repository = new KidsRepository(openDatabase(':memory:'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Titul s jedním videem (a jeho obrázkem). */
function title(folder: string, channel: string | null = null): number {
  const id = repository.ensureTitle(folder)
  repository.insertVideo({
    path: join(root, folder, `${folder}.mp4`),
    titleId: id,
    youtubeId: null,
    name: `${folder} – díl`,
    channel,
    duration: 300,
    thumbnail: join(root, 'thumb.jpg'),
    size: 1,
    mtimeMs: 1
  })
  return id
}

const PAW = {
  id: 57532,
  name: 'Tlapková patrola',
  original_name: 'PAW Patrol',
  genre_ids: [16, 10762]
}
const BING = { id: 69501, name: 'Bing', original_name: 'Bing', genre_ids: [16, 10762] }

const DETAILS: Record<number, Record<string, unknown>> = {
  57532: {
    name: 'Tlapková patrola',
    first_air_date: '2013-08-12',
    poster_path: '/paw-poster.jpg',
    backdrop_path: '/paw-backdrop.jpg',
    images: {
      backdrops: [
        { file_path: '/paw-text.jpg', iso_639_1: 'en', vote_average: 9 },
        { file_path: '/paw-clean-2.jpg', iso_639_1: null, vote_average: 5 },
        { file_path: '/paw-clean-1.jpg', iso_639_1: null, vote_average: 6 }
      ],
      posters: [{ file_path: '/paw-cs.jpg', iso_639_1: 'cs', vote_average: 5 }]
    }
  },
  69501: {
    name: 'Bing',
    first_air_date: '2014-06-09',
    images: { backdrops: [{ file_path: '/bing.jpg', iso_639_1: null }] }
  }
}

/** Falešné TMDB: hledání podle tabulky dotaz → výsledky, detail podle DETAILS. */
function fakeApi(tv: Record<string, unknown[]> = {}, movie: Record<string, unknown[]> = {}) {
  return {
    searchTv: vi.fn(async (query: string) => ({ results: tv[query] ?? [] })),
    searchMovie: vi.fn(async (query: string) => ({ results: movie[query] ?? [] })),
    tv: vi.fn(async (id: number) => ({ id, ...DETAILS[id] })),
    movie: vi.fn(async (id: number) => ({ id, ...DETAILS[id] }))
  } as unknown as TmdbApi & Record<'searchTv' | 'searchMovie' | 'tv', ReturnType<typeof vi.fn>>
}

function artwork(api: TmdbApi | null, now = () => 1000): KidsArtwork {
  return new KidsArtwork(repository, { client: () => api, coverDir: join(root, 'covers'), now })
}

const listed = (id: number) => repository.list().find((t) => t.id === id)!

describe('pickArtwork', () => {
  it('nejdřív obrázky bez textu (podle hodnocení), pak plakáty, nápisy nakonec', () => {
    expect(pickArtwork(DETAILS[57532]!)).toEqual([
      '/paw-clean-1.jpg',
      '/paw-clean-2.jpg',
      '/paw-backdrop.jpg',
      '/paw-cs.jpg',
      '/paw-poster.jpg',
      '/paw-text.jpg'
    ])
  })

  it('neplatné cesty a opakování vynechá', () => {
    expect(
      pickArtwork({
        poster_path: '/a.jpg',
        images: { posters: [{ file_path: '/a.jpg' }, { file_path: '../x.jpg' }, { file_path: 7 }] }
      })
    ).toEqual(['/a.jpg'])
  })
})

describe('cleanChannel', () => {
  it('odebere jazyk a „oficiální kanál“', () => {
    expect(cleanChannel('Bing Česky')).toBe('Bing')
    expect(cleanChannel('Prasátko Peppa - Oficiální kanál')).toBe('Prasátko Peppa')
    expect(cleanChannel('PAW Patrol - Official & Friends')).toBe('PAW Patrol & Friends')
  })
})

describe('KidsArtwork', () => {
  it('najde dětský pořad podle názvu titulu a jeho obrázek dá do kolečka', async () => {
    const id = title('Tlapková Patrola')
    const api = fakeApi({
      'Tlapková Patrola': [{ id: 1, name: 'Tlapková patrola', genre_ids: [18] }, PAW]
    })
    await artwork(api).run()

    const result = listed(id)
    expect(result.tmdb).toEqual({
      status: 'matched',
      kind: 'tv',
      id: 57532,
      name: 'Tlapková patrola',
      year: 2013
    })
    expect(result.coverUrl).toBe('kinoteka-media://tmdb/w780/paw-clean-1.jpg')
    expect(result.artwork[0]).toEqual({
      path: '/paw-clean-1.jpg',
      url: 'kinoteka-media://tmdb/w780/paw-clean-1.jpg'
    })
    // Hotový titul se příště nehledá.
    await artwork(api).run()
    expect(api.searchTv).toHaveBeenCalledTimes(1)
  })

  it('když název nestačí, zkusí kanál videí', async () => {
    const id = title('Dobrodružství s Bingem', 'Bing Česky')
    const api = fakeApi({ Bing: [BING] })
    await artwork(api).run()

    expect(api.searchTv.mock.calls.map((call) => call[0])).toEqual([
      'Dobrodružství s Bingem',
      'Bing'
    ])
    expect(listed(id).coverUrl).toBe('kinoteka-media://tmdb/w780/bing.jpg')
  })

  it('jediný dětský pořad přijme i s jiným názvem, z více nejistých žádný', async () => {
    const krtek = title('Krteček')
    const other = title('Zvířátka')
    const show = { id: 100, name: 'Krtek', genre_ids: [16] }
    await artwork(
      fakeApi({
        Krteček: [show, { id: 7, name: 'Krteček', genre_ids: [18] }],
        Zvířátka: [show, { ...BING, name: 'Lesní zvířata' }]
      })
    ).run()

    expect(listed(krtek).tmdb).toMatchObject({ status: 'matched', id: 100 })
    expect(listed(other).tmdb.status).toBe('none')
  })

  it('jen nedětské výsledky = nenalezeno, obrázek zůstane z videa', async () => {
    const id = title('Bing')
    await artwork(fakeApi({ Bing: [{ id: 5, name: 'Bing', genre_ids: [35] }] })).run()

    expect(listed(id).tmdb.status).toBe('none')
    expect(listed(id).coverUrl).toMatch(/^kinoteka-media:\/\/kids\/video\//)
  })

  it('bez klíče TMDB nic nedělá; po chybě sítě čeká a zkusí to znovu', async () => {
    const id = title('Tlapková Patrola')
    await artwork(null).run()
    expect(listed(id).tmdb.status).toBe('pending')

    let now = 1000
    const api = fakeApi({ 'Tlapková Patrola': [PAW] })
    api.searchTv.mockRejectedValueOnce(new TmdbError('TMDB není dostupné'))
    const service = artwork(api, () => now)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await service.run()
    expect(listed(id).tmdb.status).toBe('pending')
    await service.run()
    expect(api.searchTv).toHaveBeenCalledTimes(1)
    now += 11 * 60 * 1000
    await service.run()
    expect(listed(id).tmdb.status).toBe('matched')
  })

  it('ruční výběr pořadu, vypnutí TMDB a nové hledání po přejmenování', async () => {
    const id = title('Pejsek')
    const api = fakeApi()
    const service = artwork(api)
    await service.run()
    expect(listed(id).tmdb.status).toBe('none')

    expect(await service.choose(id, { kind: 'tv', id: 57532 })).toEqual({ ok: true })
    expect(listed(id).tmdb).toMatchObject({ status: 'manual', name: 'Tlapková patrola' })
    // Ručně vybraný pořad se po přejmenování nehledá znovu.
    repository.renameTitle(id, 'Tlapky')
    expect(listed(id).tmdb.status).toBe('manual')

    expect(await service.choose(id, null)).toEqual({ ok: true })
    expect(listed(id).tmdb.status).toBe('off')
    expect(listed(id).artwork).toEqual([])
    expect(listed(id).coverUrl).toMatch(/^kinoteka-media:\/\/kids\/video\//)

    await service.choose(id, { kind: 'tv', id: 69501 })
    repository.setTmdb(id, { ...listed(id).tmdb, status: 'matched' }, ['/bing.jpg'])
    repository.renameTitle(id, 'Bing')
    expect(listed(id).tmdb.status).toBe('pending')
  })

  it('hledání podle odkazu z themoviedb.org načte rovnou pořad', async () => {
    const api = fakeApi()
    const results = await artwork(api).search(
      'https://www.themoviedb.org/tv/69501-bing?language=cs'
    )
    expect(results).toEqual([
      { kind: 'tv', id: 69501, name: 'Bing', originalName: null, year: 2014, posterUrl: null }
    ])
    expect(api.searchTv).not.toHaveBeenCalled()
  })

  it('hledání podle názvu – dětské pořady první', async () => {
    const results = await artwork(
      fakeApi({ Bing: [{ id: 5, name: 'Bing Crosby Show', genre_ids: [35] }, BING] })
    ).search('Bing')
    expect(results.map((r) => r.id)).toEqual([69501, 5])
  })
})

describe('obrázek titulu', () => {
  const library = (): KidsLibrary =>
    new KidsLibrary(repository, {
      folder: () => root,
      busy: () => false,
      thumbnailDir: join(root, 'cache')
    })

  it('rodič vybere obrázek z TMDB nebo z videa', async () => {
    const id = title('Tlapková Patrola')
    const service = artwork(fakeApi({ 'Tlapková Patrola': [PAW] }))
    await service.run()

    expect(
      await library().manage({ kind: 'set-cover-image', titleId: id, image: '/paw-cs.jpg' })
    ).toEqual({ ok: true })
    expect(listed(id)).toMatchObject({
      coverImage: '/paw-cs.jpg',
      coverUrl: 'kinoteka-media://tmdb/w780/paw-cs.jpg'
    })
    expect(
      await library().manage({ kind: 'set-cover-image', titleId: id, image: '/cizi.jpg' })
    ).toEqual({ ok: false, message: 'Obrázek už k titulu nepatří.' })

    const videoId = listed(id).videos[0]!.id
    await library().manage({ kind: 'set-cover', titleId: id, videoId })
    expect(listed(id)).toMatchObject({ coverImage: null, coverVideoId: videoId })
    expect(listed(id).coverUrl).toMatch(/^kinoteka-media:\/\/kids\/video\//)

    // Jiný pořad = obrázek původního pořadu se zapomene.
    await library().manage({ kind: 'set-cover-image', titleId: id, image: '/paw-cs.jpg' })
    await service.choose(id, { kind: 'tv', id: 69501 })
    expect(listed(id).coverUrl).toBe('kinoteka-media://tmdb/w780/bing.jpg')
  })

  it('vlastní obrázek ze souboru se zkopíruje a starý smaže', async () => {
    const id = title('Krteček')
    const service = artwork(null)
    const image = join(root, 'krtek.PNG')
    await writeFile(image, 'png')

    expect(await service.setCustomCover(id, image)).toEqual({ ok: true })
    const first = repository.customCoverPath(id)!
    expect(existsSync(first)).toBe(true)
    expect(listed(id)).toMatchObject({ coverImage: 'file' })
    expect(listed(id).coverUrl).toMatch(
      new RegExp(`^kinoteka-media://kids/title/${id}\\?v=title-${id}-\\d+\\.png$`)
    )

    const second = artwork(null, () => 2000)
    expect(await second.setCustomCover(id, image)).toEqual({ ok: true })
    expect(await readdir(join(root, 'covers'))).toEqual([`title-${id}-2000.png`])

    expect(await service.setCustomCover(id, join(root, 'film.mp4'))).toEqual({
      ok: false,
      message: 'Vyber obrázek JPG, PNG nebo WebP.'
    })
  })
})
