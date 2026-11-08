import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/database'
import { YtLibrary } from '../yt/YtLibrary'
import { YtRepository } from '../yt/YtRepository'
import { merge, parseDeviceFile, SyncRepository, type DeviceFile } from './syncModel'
import { ytCategoryAdapter, ytVideoAdapter } from './ytSync'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-ytsync-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Počítač s vlastní složkou YT videí a databází. */
async function computer(id: string) {
  const db = openDatabase(':memory:')
  const folder = join(root, id, 'YT')
  const trashDir = join(root, id, 'Koš')
  const repository = new YtRepository(db)
  const library = new YtLibrary(repository, {
    folder: () => folder,
    thumbnailDir: join(root, id, 'cache'),
    fetchThumbnail: async () => new Uint8Array([1, 2, 3]),
    trash: async (path) => {
      await mkdir(trashDir, { recursive: true })
      await rename(path, join(trashDir, basename(path)))
    },
    downloadingInto: () => false
  })
  await library.scan()
  const adapters = [ytCategoryAdapter(db, library), ytVideoAdapter(db, library)]
  const sync = new SyncRepository(db)
  let file: DeviceFile = { format: 1, device: { id, name: id }, updatedAt: '', entities: [] }
  return {
    folder,
    trashDir,
    library,
    repository,
    async sync(others: DeviceFile[], at: string) {
      const result = await merge(sync, adapters, others, id, at)
      file = { ...file, updatedAt: at, entities: result.own }
      return result
    },
    get file(): DeviceFile {
      return parseDeviceFile(JSON.stringify(file))!
    },
    /** Kategorie → videa (název, online/staženo). */
    summary(): Record<string, string[]> {
      return Object.fromEntries(
        repository
          .list()
          .filter((c) => c.id !== null)
          .map((c) => [c.name, c.videos.map((v) => `${v.name}${v.online ? ' ☁' : ''}`).sort()])
          .filter(([, videos]) => videos.length > 0)
      )
    }
  }
}

/** Stažené video s údaji z YouTube v kategorii. */
async function downloaded(folder: string, category: string, name: string, id: string) {
  const dir = join(folder, category)
  await mkdir(dir, { recursive: true })
  const base = join(dir, `${name} [${id}]`)
  await writeFile(`${base}.mp4`, 'video')
  await writeFile(
    `${base}.info.json`,
    JSON.stringify({ id, title: name, channel: 'Kanál', duration: 125.4 })
  )
}

describe('sdílení YT videí mezi dvěma počítači', () => {
  it('online i stažená videa se na druhém PC objeví jako online ve stejné kategorii', async () => {
    const doma = await computer('A-doma')
    const notebook = await computer('B-notebook')
    await downloaded(doma.folder, 'Města', 'Paris Walk', 'ppppppppppp')
    await doma.library.addOnline([{ youtubeId: 'ttttttttttt', title: 'Tokyo Night' }], 'Města')
    await doma.library.manage({ kind: 'create-category', name: 'Hory' })
    await doma.library.scan()

    await doma.sync([], '2026-11-08T10:00:00.000Z')
    const result = await notebook.sync([doma.file], '2026-11-08T10:01:00.000Z')
    expect(result.errors).toEqual([])

    expect(notebook.summary()).toEqual({ Města: ['Paris Walk ☁', 'Tokyo Night ☁'] })
    expect(notebook.repository.categoryByName('Hory')).not.toBeNull()
    // Údaje (kanál, délka) od druhého PC, bez yt-dlp; náhled stažený.
    const paris = notebook.repository
      .list()
      .flatMap((c) => c.videos)
      .find((v) => v.name === 'Paris Walk')!
    expect(paris).toMatchObject({ channel: 'Kanál', durationSec: 125 })
    expect(existsSync(join(notebook.folder, 'Města', 'Paris Walk [ppppppppppp].jpg'))).toBe(true)

    // Nic nového – další synchronizace na obou stranách nic nemění.
    expect(await notebook.sync([doma.file], '2026-11-08T10:02:00.000Z')).toMatchObject({
      local: 0,
      applied: 0
    })
    expect(await doma.sync([notebook.file], '2026-11-08T10:03:00.000Z')).toMatchObject({
      local: 0,
      applied: 0
    })
  })

  it('přesun, klíčová slova, přejmenování kategorie a smazání videa se přenesou', async () => {
    const doma = await computer('A-doma')
    const notebook = await computer('B-notebook')
    await doma.library.addOnline(
      [
        { youtubeId: 'ttttttttttt', title: 'Tokyo Night' },
        { youtubeId: 'nnnnnnnnnnn', title: 'Norway Fjords' }
      ],
      'Města'
    )
    await doma.sync([], '2026-11-08T10:00:00.000Z')
    await notebook.sync([doma.file], '2026-11-08T10:01:00.000Z')

    // Na notebooku: Norsko do Přírody, klíčová slova Měst, Města → Velkoměsta.
    const id = (pc: typeof doma, name: string): number =>
      pc.repository
        .list()
        .flatMap((c) => c.videos)
        .find((v) => v.name === name)!.id
    const category = (pc: typeof doma, name: string): number =>
      pc.repository.categoryByName(name)!.id
    await notebook.library.manage({
      kind: 'move-video',
      videoId: id(notebook, 'Norway Fjords'),
      categoryId: category(notebook, 'Příroda')
    })
    await notebook.library.manage({
      kind: 'set-keywords',
      categoryId: category(notebook, 'Města'),
      keywords: ['tokyo', 'night']
    })
    await notebook.library.manage({
      kind: 'rename-category',
      categoryId: category(notebook, 'Města'),
      name: 'Velkoměsta'
    })
    await notebook.sync([doma.file], '2026-11-08T11:00:00.000Z')
    const back = await doma.sync([notebook.file], '2026-11-08T11:01:00.000Z')
    expect(back.errors).toEqual([])

    expect(doma.summary()).toEqual({ Velkoměsta: ['Tokyo Night ☁'], Příroda: ['Norway Fjords ☁'] })
    expect(doma.repository.categoryByName('Velkoměsta')!.keywords).toEqual(['tokyo', 'night'])
    expect(doma.repository.categoryByName('Města')).toBeNull()

    // Smazání na notebooku → doma do Koše.
    await notebook.library.manage({ kind: 'trash-video', videoId: id(notebook, 'Tokyo Night') })
    await notebook.sync([doma.file], '2026-11-08T12:00:00.000Z')
    await doma.sync([notebook.file], '2026-11-08T12:01:00.000Z')
    expect(doma.summary()).toEqual({ Příroda: ['Norway Fjords ☁'] })
    expect((await readdir(doma.trashDir)).some((name) => name.includes('ttttttttttt'))).toBe(true)
  })

  it('stažené video, které druhé PC má online, se nepřidá podruhé', async () => {
    const doma = await computer('A-doma')
    const notebook = await computer('B-notebook')
    await downloaded(doma.folder, 'Města', 'Paris Walk', 'ppppppppppp')
    await doma.library.scan()
    await notebook.library.addOnline([{ youtubeId: 'ppppppppppp', title: 'Paris Walk' }], 'Města')
    await doma.sync([], '2026-11-08T10:00:00.000Z')
    await notebook.sync([doma.file], '2026-11-08T10:01:00.000Z')
    expect(notebook.summary()).toEqual({ Města: ['Paris Walk ☁'] })
    expect(doma.summary()).toEqual({ Města: ['Paris Walk'] })
  })
})
