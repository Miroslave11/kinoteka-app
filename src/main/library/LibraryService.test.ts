import { mkdir, mkdtemp, rename, rm, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/database'
import { LibraryRepository } from './LibraryRepository'
import { LibraryError, LibraryService } from './LibraryService'

describe('LibraryService', () => {
  let root: string
  let movies: string
  let repository: LibraryRepository
  let service: LibraryService

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kinoteka-lib-'))
    movies = join(root, 'Filmy')
    await mkdir(movies)
    await writeFile(join(movies, 'Prázdnota (2020) cz dabing.mkv'), 'aaaa')
    await writeFile(join(movies, 'V úkrytu (2026) cz dabing.mkv'), 'bbbbbb')
    repository = new LibraryRepository(openDatabase(':memory:'))
    service = new LibraryService(repository, 1000)
  })

  afterEach(() => rm(root, { recursive: true, force: true }))

  it('přidá složku a první sken najde soubory', async () => {
    const folder = await service.addFolder(movies)
    expect(folder).toMatchObject({ name: 'Filmy', kind: 'local', online: true })

    const result = await service.scanFolder(folder.id)
    expect(result).toMatchObject({ online: true, added: 2, total: 2 })
    expect(repository.listFiles().map((f) => f.fileName)).toEqual([
      'Prázdnota (2020) cz dabing.mkv',
      'V úkrytu (2026) cz dabing.mkv'
    ])
  })

  it('opakovaný sken zpracuje jen změny a přejmenování zachová id', async () => {
    const folder = await service.addFolder(movies)
    await service.scanFolder(folder.id)
    const before = repository.listFiles()

    await rename(
      join(movies, 'Prázdnota (2020) cz dabing.mkv'),
      join(movies, 'Prázdnota (2020).mkv')
    )
    await appendFile(join(movies, 'V úkrytu (2026) cz dabing.mkv'), 'zmena')
    await writeFile(join(movies, 'Den odhalení (2026).mkv'), 'novy')

    const result = await service.scanFolder(folder.id)
    expect(result).toMatchObject({
      added: 1,
      updated: 1,
      moved: 1,
      removed: 0,
      unchanged: 0,
      total: 3
    })
    const renamed = repository.listFiles().find((f) => f.fileName === 'Prázdnota (2020).mkv')
    expect(renamed?.id).toBe(before.find((f) => f.fileName.startsWith('Prázdnota'))?.id)
  })

  it('smazaný soubor zmizí z knihovny', async () => {
    const folder = await service.addFolder(movies)
    await service.scanFolder(folder.id)
    await rm(join(movies, 'V úkrytu (2026) cz dabing.mkv'))
    expect(await service.scanFolder(folder.id)).toMatchObject({ removed: 1, total: 1 })
  })

  it('nedostupná složka: nic se nesmaže, soubory se označí a po návratu zase odznačí', async () => {
    const folder = await service.addFolder(movies)
    await service.scanFolder(folder.id)

    await rename(movies, join(root, 'Filmy-odpojeno'))
    const offline = await service.scanFolder(folder.id)
    expect(offline.online).toBe(false)
    expect(repository.getFolder(folder.id)).toMatchObject({ online: false, fileCount: 0 })
    expect(repository.listFiles()).toHaveLength(2)
    expect(repository.listFiles().every((f) => !f.available)).toBe(true)

    await rename(join(root, 'Filmy-odpojeno'), movies)
    const back = await service.scanFolder(folder.id)
    expect(back).toMatchObject({ online: true, unchanged: 2, removed: 0 })
    expect(repository.listFiles().every((f) => f.available)).toBe(true)
  })

  it('odmítne duplicitní, vnořenou, nadřazenou a neexistující složku', async () => {
    await mkdir(join(movies, 'Seriály'))
    await service.addFolder(movies)
    await expect(service.addFolder(movies.toUpperCase())).rejects.toBeInstanceOf(LibraryError)
    await expect(service.addFolder(join(movies, 'Seriály'))).rejects.toThrow('už je v knihovně')
    await expect(service.addFolder(root)).rejects.toThrow('obsahuje jinou složku')
    await expect(service.addFolder(join(root, 'nic'))).rejects.toThrow('neexistuje')
    await expect(service.addFolder('relativni\\cesta')).rejects.toThrow('celou cestu')
  })

  it('odebrání složky smaže její záznamy, ne soubory', async () => {
    const folder = await service.addFolder(movies)
    await service.scanFolder(folder.id)
    service.removeFolder(folder.id)
    expect(repository.listFolders()).toEqual([])
    expect(repository.listFiles()).toEqual([])
    expect(await service.addFolder(movies)).toBeTruthy()
  })

  it('souběžné skeny stejné složky běží jen jednou', async () => {
    const folder = await service.addFolder(movies)
    const [a, b] = await Promise.all([service.scanFolder(folder.id), service.scanFolder(folder.id)])
    expect(a).toBe(b)
  })
})
