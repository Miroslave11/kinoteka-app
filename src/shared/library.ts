export type FolderKind = 'local' | 'network'

export interface LibraryFolder {
  id: number
  path: string
  name: string
  kind: FolderKind
  online: boolean
  /** Počet dostupných video souborů ve složce. */
  fileCount: number
  lastScanAt: string | null
  lastScanError: string | null
}

export interface MediaFileSummary {
  id: number
  folderId: number
  path: string
  /** Cesta vůči složce knihovny, např. „Seriály\\Země gangů\\S01E01.mkv“. */
  relativePath: string
  fileName: string
  size: number
  available: boolean
  addedAt: string
}

export interface ScanResult {
  folderId: number
  online: boolean
  added: number
  updated: number
  moved: number
  removed: number
  unchanged: number
  /** Počet souborů ve složce po skenu. */
  total: number
  error?: string
}

export interface ScanProgress {
  folderId: number
  /** Kolik video souborů už sken našel. */
  found: number
  done: boolean
}

export type AddFolderResult =
  | { ok: true; folder: LibraryFolder; scan: ScanResult }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'error'; message: string }

export const VIDEO_EXTENSIONS = [
  'mkv',
  'mp4',
  'm4v',
  'avi',
  'ts',
  'm2ts',
  'mov',
  'wmv',
  'webm',
  'mpg',
  'mpeg'
] as const

const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS)

export function isVideoFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 && VIDEO_EXTENSION_SET.has(fileName.slice(dot + 1).toLowerCase())
}

/** Síťová cesta ve tvaru \\server\sdílení… */
export function isNetworkPath(path: string): boolean {
  return /^(\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(path)
}

/** 4 412 345 678 → „4,1 GB“. */
export function formatSize(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0
  return `${value.toLocaleString('cs-CZ', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`
}

/** ISO čas → „před 5 minutami“ (vůči `now`). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat('cs', { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return 'právě teď'
}
