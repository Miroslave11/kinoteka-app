/** Soubor patřící k filmu nebo dílu. */
export interface CatalogFile {
  id: number
  fileName: string
  relativePath: string
  size: number
  available: boolean
  tags: string[]
}

export interface MovieItem {
  id: number
  name: string
  year: number | null
  /** Štítky ze všech souborů filmu („CZ dabing“, „1080p“…). */
  tags: string[]
  files: CatalogFile[]
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
}
