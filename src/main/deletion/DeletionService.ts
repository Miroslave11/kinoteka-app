import { readdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { DeletionFile, DeletionPlan, DeletionResult } from '../../shared/deletion'
import { isNetworkPath, VIDEO_EXTENSIONS } from '../../shared/library'
import { subtitleMatchesVideo } from '../../shared/subtitles'
import type { LibraryRepository } from '../library/LibraryRepository'
import { findExternalSubtitles } from '../subtitles/externalSubtitles'

export interface DeletionOps {
  /** Přesun do Koše (lokální disk). */
  trash(path: string): Promise<void>
  /** Trvalé smazání (síťový disk). */
  remove(path: string): Promise<void>
  /** Soubor se právě přehrává – nemazat. */
  isPlaying(path: string): boolean
  /** Zavolá se po smazání souborů z knihovny (přestavba katalogu, oznámení oknům). */
  removedFromLibrary(fileIds: number[]): void
  /** Titulky patřící k videu (výchozí: `ownSubtitles`). */
  subtitlesOf?(videoPath: string): Promise<string[]>
}

const withoutExtension = (file: string): string => basename(file, extname(file))

/**
 * Titulky, které patří jen tomuto videu. Když název titulků víc odpovídá jinému videu
 * ve stejné složce („Alien Romulus.srt“ při mazání „Alien.mkv“), zůstanou.
 */
export async function ownSubtitles(videoPath: string): Promise<string[]> {
  const found = await findExternalSubtitles(videoPath)
  if (found.length === 0) return []
  const dir = dirname(videoPath)
  let siblings: string[] = []
  try {
    siblings = (await readdir(dir))
      .filter((name) =>
        (VIDEO_EXTENSIONS as readonly string[]).includes(extname(name).slice(1).toLowerCase())
      )
      .map(withoutExtension)
  } catch {
    // složka nedostupná – nic navíc nepřidáme
  }
  const ownBase = withoutExtension(videoPath)
  const result: string[] = []
  for (const subtitle of found) {
    const base = withoutExtension(subtitle)
    const betterOwner = siblings.some(
      (other) =>
        other !== ownBase && other.length > ownBase.length && subtitleMatchesVideo(other, base)
    )
    if (betterOwner) continue
    result.push(subtitle)
    // VobSub: k .idx patří i .sub se stejným názvem.
    if (extname(subtitle).toLowerCase() === '.idx')
      result.push(join(dirname(subtitle), `${base}.sub`))
  }
  return result
}

/** Mazání filmů a dílů z disku. Deník a hodnocení v databázi zůstávají. */
export class DeletionService {
  constructor(
    private readonly library: LibraryRepository,
    private readonly ops: DeletionOps
  ) {}

  async plan(fileIds: number[]): Promise<DeletionPlan> {
    const files: DeletionFile[] = []
    for (const id of fileIds) {
      const file = this.library.getFile(id)
      if (!file) continue
      files.push({
        id,
        path: file.path,
        fileName: file.fileName,
        size: file.size,
        subtitles: file.available ? await (this.ops.subtitlesOf ?? ownSubtitles)(file.path) : [],
        network: isNetworkPath(file.path),
        available: file.available
      })
    }
    return {
      files,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      network: files.some((f) => f.network)
    }
  }

  async execute(fileIds: number[]): Promise<DeletionResult> {
    const { files } = await this.plan(fileIds)
    const result: DeletionResult = { deleted: 0, failed: [] }
    const removed: number[] = []
    for (const file of files) {
      if (!file.available) {
        result.failed.push({ path: file.path, message: 'Soubor teď není dostupný.' })
        continue
      }
      if (this.ops.isPlaying(file.path)) {
        result.failed.push({ path: file.path, message: 'Soubor se právě přehrává.' })
        continue
      }
      const erase = (path: string): Promise<void> =>
        file.network ? this.ops.remove(path) : this.ops.trash(path)
      try {
        await erase(file.path)
      } catch (error) {
        result.failed.push({ path: file.path, message: (error as Error).message })
        continue
      }
      removed.push(file.id)
      result.deleted++
      for (const subtitle of file.subtitles) {
        // Chybějící .sub k .idx ani nepovedené titulky smazání videa nezastaví.
        await erase(subtitle).catch(() => undefined)
      }
    }
    if (removed.length > 0) this.ops.removedFromLibrary(removed)
    return result
  }
}
