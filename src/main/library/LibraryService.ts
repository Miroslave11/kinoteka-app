import { EventEmitter } from 'node:events'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import {
  isNetworkPath,
  type LibraryFolder,
  type ScanProgress,
  type ScanResult
} from '../../shared/library'
import type { LibraryRepository } from './LibraryRepository'
import { diffScan, isFolderReachable, listVideoFiles } from './scanner'

/** Chyba, jejíž zpráva je určená uživateli. */
export class LibraryError extends Error {}

interface LibraryServiceEvents {
  changed: []
  progress: [ScanProgress]
}

/** a je stejná nebo vnořená cesta v b (bez ohledu na velikost písmen). */
function isSameOrInside(a: string, b: string): boolean {
  const rel = relative(b.toLowerCase(), a.toLowerCase())
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export class LibraryService extends EventEmitter<LibraryServiceEvents> {
  private readonly running = new Map<number, Promise<ScanResult>>()

  constructor(
    private readonly repository: LibraryRepository,
    private readonly reachabilityTimeoutMs = 5000
  ) {
    super()
  }

  listFolders(): LibraryFolder[] {
    return this.repository.listFolders()
  }

  async addFolder(rawPath: string): Promise<LibraryFolder> {
    const trimmed = rawPath.trim().replace(/[\\/]+$/, '')
    if (!trimmed || !(isAbsolute(trimmed) || isNetworkPath(trimmed))) {
      throw new LibraryError('Zadej celou cestu ke složce, např. C:\\Filmy nebo \\\\NAS\\video.')
    }
    const path = isNetworkPath(trimmed) ? trimmed.replace(/\//g, '\\') : resolve(trimmed)

    for (const folder of this.repository.listFolders()) {
      if (isSameOrInside(path, folder.path)) {
        throw new LibraryError(`Složka už je v knihovně (${folder.path}).`)
      }
      if (isSameOrInside(folder.path, path)) {
        throw new LibraryError(
          `Složka obsahuje jinou složku knihovny (${folder.path}). Nejdřív ji odeber.`
        )
      }
    }
    if (!(await isFolderReachable(path, this.reachabilityTimeoutMs))) {
      throw new LibraryError(`Složka ${path} neexistuje nebo není dostupná.`)
    }

    const folder = this.repository.addFolder({
      path,
      name: basename(path) || path,
      kind: isNetworkPath(path) ? 'network' : 'local'
    })
    this.emit('changed')
    return folder
  }

  /** Soubory smazané z disku aplikací – z knihovny hned, bez čekání na sken. */
  filesRemoved(ids: number[]): void {
    this.repository.removeFiles(ids)
    this.emit('changed')
  }

  removeFolder(id: number): void {
    this.repository.removeFolder(id)
    this.emit('changed')
  }

  /** Sken jedné složky; souběžné požadavky na stejnou složku sdílí jeden běh. */
  scanFolder(id: number): Promise<ScanResult> {
    const existing = this.running.get(id)
    if (existing) return existing
    const run = this.runScan(id).finally(() => this.running.delete(id))
    this.running.set(id, run)
    return run
  }

  async scanAll(): Promise<ScanResult[]> {
    const results: ScanResult[] = []
    // Postupně – paralelní čtení z jednoho NAS by bylo pomalejší.
    for (const folder of this.repository.listFolders())
      results.push(await this.scanFolder(folder.id))
    return results
  }

  private async runScan(id: number): Promise<ScanResult> {
    const folder = this.repository.getFolder(id)
    if (!folder) throw new LibraryError('Složka už v knihovně není.')
    const empty = { folderId: id, added: 0, updated: 0, moved: 0, removed: 0, unchanged: 0 }

    const offline = (error: string): ScanResult => {
      this.repository.markOffline(id, error)
      this.emit('changed')
      return { ...empty, online: false, total: folder.fileCount, error }
    }

    if (!(await isFolderReachable(folder.path, this.reachabilityTimeoutMs))) {
      return offline('Složka není dostupná (vypnutý NAS nebo odpojený disk).')
    }

    let listing
    try {
      listing = await listVideoFiles(folder.path, (found) =>
        this.emit('progress', { folderId: id, found, done: false })
      )
    } catch (error) {
      return offline(`Složku nelze přečíst: ${(error as Error).message}`)
    }

    const diff = diffScan(this.repository.storedFiles(id), listing)
    this.repository.applyScan(id, diff)
    this.emit('progress', { folderId: id, found: listing.files.length, done: true })
    this.emit('changed')
    return {
      folderId: id,
      online: true,
      added: diff.added.length,
      updated: diff.updated.length,
      moved: diff.moved.length,
      removed: diff.removed.length,
      unchanged: diff.unchanged,
      total: this.repository.getFolder(id)?.fileCount ?? 0
    }
  }
}
