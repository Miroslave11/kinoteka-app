import type { FolderKind } from './library'
import type { MediaInfo, MediaSummary } from './mediaInfo'
import type { CsfdData, CsfdStatus } from './csfd'
import type { MatchStatus, TitleMetadata } from './metadata'

/** Soubor patřící k filmu nebo dílu. */
export interface CatalogFile {
  id: number
  fileName: string
  relativePath: string
  size: number
  available: boolean
  tags: string[]
  /** ISO čas, kdy soubor přibyl do knihovny. */
  addedAt: string
  /** Shrnutí z ffprobe; null, dokud analýza neproběhla. */
  summary: MediaSummary | null
}

/** Vše pro panel „Vlastnosti souboru“. */
export interface FileDetails {
  file: CatalogFile
  path: string
  folderName: string
  folderKind: FolderKind
  info: MediaInfo | null
  /** Proč se vlastnosti nepodařilo zjistit. */
  error: string | null
  /** Analýza ještě neproběhla. */
  pending: boolean
}

export interface MovieItem {
  id: number
  name: string
  year: number | null
  /** Štítky ze všech souborů filmu („CZ dabing“, „1080p“…). */
  tags: string[]
  files: CatalogFile[]
  metadata: TitleMetadata | null
  matchStatus: MatchStatus
  csfd: CsfdData | null
  csfdStatus: CsfdStatus
}

export interface EpisodeItem {
  id: number
  season: number
  episode: number
  name: string | null
  files: CatalogFile[]
}

export interface SeasonItem {
  number: number
  episodes: EpisodeItem[]
}

export interface ShowItem {
  id: number
  name: string
  year: number | null
  /** Další názvy, pod kterými jsou soubory pojmenované (např. „The Watcher“). */
  alternativeNames: string[]
  tags: string[]
  seasons: SeasonItem[]
  episodeCount: number
  metadata: TitleMetadata | null
  matchStatus: MatchStatus
  csfd: CsfdData | null
  csfdStatus: CsfdStatus
}
