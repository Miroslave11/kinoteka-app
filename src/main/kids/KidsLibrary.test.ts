import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { KidsLibrary } from './KidsLibrary'
import { KidsRepository } from './KidsRepository'

let root: string
let kids: string
let repository: KidsRepository

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-kidslib-'))
  kids = join(root, 'Kids')
  repository = new KidsRepository(openDatabase(':memory:'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Video stažené yt-dlp: mp4, obrázek a údaje z YouTube vedle sebe. */
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

/** Koš v testech = složka vedle Kids. */
const trashed = (): Promise<string[]> => readdir(join(root, 'Koš')).catch(() => [])

function library(options: { busy?: boolean; downloadingInto?: string } = {}) {
  return new KidsLibrary(repository, {
    folder: () => kids,
    busy: () => options.busy ?? false,
    trash: async (path) => {
      await mkdir(join(root, 'Koš'), { recursive: true })
      await rename(path, join(root, 'Koš', basename(path)))
    },
    downloadingInto: (folder) => folder === options.downloadingInto,
    probeDuration: vi.fn(async () => 42),
    makeThumbnail: vi.fn(async (_input: string, _at: number, output: string) => {
      await writeFile(output, 'frame')
    }),
    thumbnailDir: join(root, 'cache')
  })
}

const summary = () => repository.list().map((t) => [t.name, t.videos.map((v) => v.name).sort()])

describe('KidsLibrary', () => {
  it('videa z kořene zařadí podle kanálu a přesune i s obrázkem a údaji', async () => {
    await downloaded(
      kids,
      '🎁 Santova návštěva! ｜ Prasátko Peppa ｜ Karikatury pro děti',
      'cvFi8yySA9I',
      {
        title: '🎁 Santova návštěva! | Prasátko Peppa | Karikatury pro děti',
        channel: 'Prasátko Peppa - Oficiální kanál',
        duration: 3510
      }
    )
    await downloaded(kids, 'Bláto ｜ Prasátko Peppa', 'aaaaaaaaaaa', {
      title: 'Bláto | Prasátko Peppa',
      channel: 'Prasátko Peppa - Oficiální kanál',
      duration: 300
    })
    await downloaded(kids, 'Pups Save the Train', 'bbbbbbbbbbb', {
      title: 'Pups Save the Train',
      channel: 'PAW Patrol - Official & Friends',
      duration: 660
    })

    const result = await library().scan()

    expect(result).toMatchObject({ titles: 2, videos: 3, sorted: 3, errors: [] })
    expect(summary()).toEqual([
      ['PAW Patrol', ['Pups Save the Train']],
      ['Prasátko Peppa', ['Bláto', 'Santova návštěva!']]
    ])
    const peppa = join(kids, 'Prasátko Peppa')
    expect(existsSync(join(peppa, 'Bláto ｜ Prasátko Peppa [aaaaaaaaaaa].mp4'))).toBe(true)
    expect(existsSync(join(peppa, 'Bláto ｜ Prasátko Peppa [aaaaaaaaaaa].jpg'))).toBe(true)
    expect(existsSync(join(peppa, 'Bláto ｜ Prasátko Peppa [aaaaaaaaaaa].info.json'))).toBe(true)
    expect(existsSync(join(kids, 'Bláto ｜ Prasátko Peppa [aaaaaaaaaaa].mp4'))).toBe(false)
    const video = repository.list()[1]!.videos.find((v) => v.name === 'Bláto')!
    expect(video).toMatchObject({ durationSec: 300, channel: 'Prasátko Peppa - Oficiální kanál' })
    expect(video.thumbnailUrl).toMatch(/^kinoteka-media:\/\/kids\/video\/\d+\?v=\d+$/)
    // Podle YouTube ID se pozná, že video už ve složce je.
    expect(repository.videoByYoutubeId('aaaaaaaaaaa')).toEqual({
      id: video.id,
      title: 'Prasátko Peppa'
    })
    expect(repository.videoByYoutubeId('zzzzzzzzzzz')).toBeNull()
  })

  it('ručně založená podsložka je titul a přiřadí se do ní podle jejího jména', async () => {
    await mkdir(join(kids, 'Krteček'), { recursive: true })
    await downloaded(join(kids, 'Krteček'), 'Krtek a autíčko', 'ccccccccccc', null)
    await downloaded(kids, 'Krteček a kalhotky', 'ddddddddddd', {
      title: 'Krteček a kalhotky',
      channel: 'Pohádky pro děti'
    })

    await library().scan()

    expect(summary()).toEqual([['Krteček', ['Krtek a autíčko', 'Krteček a kalhotky']]])
  })

  it('video bez údajů zůstane ve složce jako „Ostatní“, doplní se délka a obrázek', async () => {
    await mkdir(kids, { recursive: true })
    await writeFile(join(kids, 'domaci video.mp4'), 'x')
    const lib = library()

    await lib.scan()
    await vi.waitFor(() => expect(repository.list()[0]!.videos[0]!.thumbnailUrl).not.toBeNull())

    expect(summary()).toEqual([['Ostatní', ['domaci video']]])
    expect(repository.list()[0]).toMatchObject({ id: null, videos: [{ durationSec: 42 }] })
  })

  it('rozpracované soubory yt-dlp ignoruje a během stahování nic nepřesouvá', async () => {
    await downloaded(kids, 'Bluey', 'eeeeeeeeeee', { title: 'Bluey', channel: 'Bluey' })
    await writeFile(join(kids, 'Bing [fffffffffff].f398.mp4'), 'část')
    await writeFile(join(kids, 'Bing [fffffffffff].temp.mp4'), 'část')

    await library({ busy: true }).scan()
    expect(summary()).toEqual([['Ostatní', ['Bluey']]])

    await library().scan()
    expect(summary()).toEqual([['Bluey', ['Bluey']]])
  })

  it('smazané video a prázdná složka zmizí; přesunuté video si nechá id', async () => {
    const path = await downloaded(join(kids, 'Bing'), 'Kouzelník', 'ggggggggggg', null)
    await downloaded(join(kids, 'Bing'), 'Déšť', 'hhhhhhhhhhh', null)
    const lib = library()
    await lib.scan()
    const id = repository.list()[0]!.videos.find((v) => v.name === 'Kouzelník')!.id

    await rm(join(kids, 'Bing', 'Déšť [hhhhhhhhhhh].mp4'))
    await mkdir(join(kids, 'Bing a přátelé'))
    const { rename } = await import('node:fs/promises')
    await rename(path, join(kids, 'Bing a přátelé', 'Kouzelník [ggggggggggg].mp4'))
    await lib.scan()

    expect(summary()).toEqual([['Bing a přátelé', ['Kouzelník']]])
    expect(repository.list()[0]!.videos[0]!.id).toBe(id)
  })
})

describe('KidsLibrary – správa titulů', () => {
  async function setup(options: Parameters<typeof library>[0] = {}) {
    await downloaded(join(kids, 'Peppa'), 'Bláto', 'aaaaaaaaaaa', { title: 'Bláto', channel: 'P' })
    await downloaded(join(kids, 'Peppa'), 'Výlet', 'bbbbbbbbbbb', { title: 'Výlet', channel: 'P' })
    await downloaded(join(kids, 'Krteček'), 'Autíčko', 'ccccccccccc', { title: 'Autíčko' })
    const lib = library(options)
    await lib.scan()
    const titles = repository.list({ includeEmpty: true })
    const peppa = titles.find((t) => t.name === 'Peppa')!
    const krtek = titles.find((t) => t.name === 'Krteček')!
    return { lib, peppa, krtek, mud: peppa.videos.find((v) => v.name === 'Bláto')! }
  }

  it('přejmenuje titul i složku, videa si nechají id a pozici', async () => {
    const { lib, peppa, mud } = await setup()
    repository.record(mud.id, 100, 300)

    expect(
      await lib.manage({ kind: 'rename-title', titleId: peppa.id!, name: 'Prasátko Peppa' })
    ).toEqual({ ok: true })

    expect(existsSync(join(kids, 'Prasátko Peppa', 'Bláto [aaaaaaaaaaa].mp4'))).toBe(true)
    expect(existsSync(join(kids, 'Peppa'))).toBe(false)
    const renamed = repository.list().find((t) => t.id === peppa.id)!
    expect(renamed.name).toBe('Prasátko Peppa')
    expect(renamed.videos.find((v) => v.id === mud.id)!.thumbnailUrl).not.toBeNull()
    expect(repository.videoPath(mud.id)).toBe(
      join(kids, 'Prasátko Peppa', 'Bláto [aaaaaaaaaaa].mp4')
    )
    expect(repository.progress(mud.id)?.position).toBe(100)
    // Další sken nic nezmění (žádné nové id).
    await lib.scan()
    expect(
      repository
        .list()
        .find((t) => t.id === peppa.id)!
        .videos.map((v) => v.id)
    ).toContain(mud.id)
  })

  it('přejmenování na existující titul nebo během stahování odmítne', async () => {
    const { lib, peppa } = await setup({ downloadingInto: 'Krteček' })
    expect(await lib.manage({ kind: 'rename-title', titleId: peppa.id!, name: 'krteček' })).toEqual(
      { ok: false, message: 'Titul s tímto názvem už je.' }
    )
    const krtek = repository.list().find((t) => t.name === 'Krteček')!
    expect(await lib.manage({ kind: 'rename-title', titleId: krtek.id!, name: 'Krtek' })).toEqual({
      ok: false,
      message: 'Do titulu se právě stahuje – počkej, až stahování doběhne.'
    })
  })

  it('přesune video i s obrázkem a údaji do jiného titulu', async () => {
    const { lib, krtek, mud } = await setup()

    expect(await lib.manage({ kind: 'move-video', videoId: mud.id, titleId: krtek.id! })).toEqual({
      ok: true
    })

    expect((await readdir(join(kids, 'Krteček'))).sort()).toEqual([
      'Autíčko [ccccccccccc].info.json',
      'Autíčko [ccccccccccc].jpg',
      'Autíčko [ccccccccccc].mp4',
      'Bláto [aaaaaaaaaaa].info.json',
      'Bláto [aaaaaaaaaaa].jpg',
      'Bláto [aaaaaaaaaaa].mp4'
    ])
    expect(summary()).toEqual([
      ['Krteček', ['Autíčko', 'Bláto']],
      ['Peppa', ['Výlet']]
    ])
    expect(repository.list()[0]!.videos.find((v) => v.name === 'Bláto')!.id).toBe(mud.id)
  })

  it('smaže video do Koše i s obrázkem a údaji', async () => {
    const { lib, mud } = await setup()

    expect(await lib.manage({ kind: 'trash-video', videoId: mud.id })).toEqual({ ok: true })

    expect((await trashed()).sort()).toEqual([
      'Bláto [aaaaaaaaaaa].info.json',
      'Bláto [aaaaaaaaaaa].jpg',
      'Bláto [aaaaaaaaaaa].mp4'
    ])
    expect(summary()).toEqual([
      ['Krteček', ['Autíčko']],
      ['Peppa', ['Výlet']]
    ])
  })

  it('nový titul, obrázek titulu a klíčová slova; smazání titulu do Koše', async () => {
    const { lib, peppa } = await setup()
    const second = peppa.videos.find((v) => v.name === 'Výlet')!

    expect(await lib.manage({ kind: 'create-title', name: 'Bluey' })).toEqual({ ok: true })
    expect(existsSync(join(kids, 'Bluey'))).toBe(true)
    expect(repository.list({ includeEmpty: true }).map((t) => t.name)).toContain('Bluey')
    expect(repository.list().map((t) => t.name)).not.toContain('Bluey')

    await lib.manage({ kind: 'set-cover', titleId: peppa.id!, videoId: second.id })
    await lib.manage({ kind: 'set-keywords', titleId: peppa.id!, keywords: ['peppa pig'] })
    const updated = repository.list().find((t) => t.id === peppa.id)!
    expect(updated).toMatchObject({
      coverVideoId: second.id,
      coverUrl: second.thumbnailUrl,
      keywords: ['peppa pig']
    })
    const krtek = repository.list().find((t) => t.name === 'Krteček')!
    expect(await lib.manage({ kind: 'set-cover', titleId: krtek.id!, videoId: second.id })).toEqual(
      { ok: false, message: 'Video už v titulu není.' }
    )

    expect(await lib.manage({ kind: 'trash-title', titleId: peppa.id! })).toEqual({ ok: true })
    expect(await trashed()).toEqual(['Peppa'])
    expect(summary()).toEqual([['Krteček', ['Autíčko']]])
  })

  it('soubor otevřený jinde → srozumitelná chyba, záznam zůstane', async () => {
    const { mud } = await setup()
    const lib = new KidsLibrary(repository, {
      folder: () => kids,
      busy: () => false,
      thumbnailDir: join(root, 'cache'),
      trash: async () => {
        throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' })
      }
    })

    expect(await lib.manage({ kind: 'trash-video', videoId: mud.id })).toEqual({
      ok: false,
      message:
        'Soubor je otevřený v jiném programu (třeba v přehrávači) – zavři ho a zkus to znovu.'
    })
    expect(repository.videoPath(mud.id)).not.toBeNull()
  })
})
