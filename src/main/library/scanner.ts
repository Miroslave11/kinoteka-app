import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { isVideoFile } from '../../shared/library'

export interface FoundFile {
  path: string
  relativePath: string
  size: number
  mtimeMs: number
}

export interface StoredFile {
  id: number
  path: string
  size: number
  mtimeMs: number
}

export interface FolderListing {
  files: FoundFile[]
  /** Podsložky, které se nepodařilo přečíst – jejich soubory se nesmí považovat za smazané. */
  unreadableDirs: string[]
}

/** Systémové a pomocné složky Windows a Synology, ve kterých filmy nehledáme. */
const IGNORED_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  '#recycle',
  '#snapshot',
  '@eadir',
  '@tmp',
  '.trash'
])

export function isIgnoredDir(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name.toLowerCase())
}

/** Projde složku do hloubky a vrátí všechna videa. Symbolické odkazy přeskakuje. */
export async function listVideoFiles(
  root: string,
  onProgress?: (found: number) => void
): Promise<FolderListing> {
  const files: FoundFile[] = []
  const unreadableDirs: string[] = []
  const pending = [root]

  while (pending.length > 0) {
    const dir = pending.pop()!
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (dir === root) throw error
      unreadableDirs.push(dir)
      continue
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!isIgnoredDir(entry.name)) pending.push(fullPath)
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        try {
          const info = await stat(fullPath)
          files.push({
            path: fullPath,
            relativePath: relative(root, fullPath),
            size: info.size,
            mtimeMs: Math.floor(info.mtimeMs)
          })
          if (onProgress && files.length % 100 === 0) onProgress(files.length)
        } catch {
          // Soubor mezitím zmizel nebo je zamčený – při příštím skenu se zkusí znovu.
        }
      }
    }
  }
  return { files, unreadableDirs }
}

export interface ScanDiff {
  added: FoundFile[]
  /** Stejná cesta, jiná velikost nebo čas změny. */
  updated: { id: number; file: FoundFile }[]
  /** Přejmenovaný nebo přesunutý soubor – zachová si id (a tím později i metadata a pozici). */
  moved: { id: number; file: FoundFile }[]
  removed: number[]
  unchanged: number
}

const key = (path: string): string => path.toLowerCase()

/** Porovná stav v databázi s tím, co je na disku. Cesty ve Windows nerozlišují velikost písmen. */
export function diffScan(stored: readonly StoredFile[], listing: FolderListing): ScanDiff {
  const storedByPath = new Map(stored.map((file) => [key(file.path), file]))
  const foundPaths = new Set(listing.files.map((file) => key(file.path)))
  const skipped = listing.unreadableDirs.map((dir) => key(dir.endsWith('\\') ? dir : `${dir}\\`))

  const diff: ScanDiff = { added: [], updated: [], moved: [], removed: [], unchanged: 0 }
  const newFiles: FoundFile[] = []

  for (const file of listing.files) {
    const existing = storedByPath.get(key(file.path))
    if (!existing) newFiles.push(file)
    else if (existing.size !== file.size || existing.mtimeMs !== file.mtimeMs)
      diff.updated.push({ id: existing.id, file })
    else diff.unchanged++
  }

  const missing = stored.filter((file) => {
    if (foundPaths.has(key(file.path))) return false
    // Soubor v nečitelné podsložce není smazaný, jen o něm teď nevíme.
    if (skipped.some((prefix) => key(file.path).startsWith(prefix))) {
      diff.unchanged++
      return false
    }
    return true
  })

  // Nový soubor se stejnou velikostí a časem změny jako chybějící = přesun/přejmenování.
  for (const file of newFiles) {
    const index = missing.findIndex(
      (candidate) => candidate.size === file.size && candidate.mtimeMs === file.mtimeMs
    )
    if (index >= 0) {
      diff.moved.push({ id: missing[index]!.id, file })
      missing.splice(index, 1)
    } else {
      diff.added.push(file)
    }
  }
  diff.removed = missing.map((file) => file.id)
  return diff
}

/** Je složka dostupná? Odpojený NAS umí stat blokovat desítky sekund, proto časový limit. */
export async function isFolderReachable(path: string, timeoutMs = 5000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  const check = stat(path).then(
    (info) => info.isDirectory(),
    () => false
  )
  try {
    return await Promise.race([check, timeout])
  } finally {
    clearTimeout(timer)
  }
}
