import type { FileClassification } from '../../shared/classification'
import { normalizeTitle, parseMediaPath, type ParsedName } from './naming'

export interface FileForGrouping {
  id: number
  relativePath: string
}

export interface MovieGroup {
  kind: 'movie'
  /** Klíč pro spárování s uloženým titulem: normalizovaný název + rok. */
  key: string
  name: string
  year: number | null
  fileIds: number[]
}

export interface EpisodeGroup {
  season: number
  episode: number
  name: string | null
  fileIds: number[]
}

export interface ShowGroup {
  kind: 'show'
  /** Hlavní klíč (nejčastější normalizovaný název). */
  key: string
  /** Všechny normalizované varianty názvu, podle kterých se soubory spojily. */
  keys: string[]
  name: string
  alternativeNames: string[]
  year: number | null
  episodes: EpisodeGroup[]
}

export interface Grouping {
  movies: MovieGroup[]
  shows: ShowGroup[]
  parsed: Map<number, ParsedName>
}

const UNKNOWN_SHOW = 'Neznámý seriál'

const diacriticCount = (text: string): number => text.normalize('NFD').match(/\p{M}/gu)?.length ?? 0

function mostFrequent<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/** Z variant stejného názvu vybere tu s diakritikou („Vidím Vás“ má přednost před „Vidim vas“). */
function pickDisplayName(variants: string[]): string {
  const frequency = new Map<string, number>()
  for (const variant of variants) frequency.set(variant, (frequency.get(variant) ?? 0) + 1)
  return [...frequency.keys()].sort(
    (a, b) =>
      diacriticCount(b) - diacriticCount(a) ||
      frequency.get(b)! - frequency.get(a)! ||
      a.localeCompare(b, 'cs')
  )[0]!
}

/** Jednoduché union-find nad klíči názvů – „vidim vas“ a „the watcher“ ze stejného souboru se spojí. */
class KeyUnion {
  private readonly parent = new Map<string, string>()

  find(key: string): string {
    if (!this.parent.has(key)) this.parent.set(key, key)
    let root = key
    while (this.parent.get(root) !== root) root = this.parent.get(root)!
    this.parent.set(key, root)
    return root
  }

  union(keys: string[]): void {
    const [first, ...rest] = keys
    if (first === undefined) return
    const root = this.find(first)
    for (const key of rest) this.parent.set(this.find(key), root)
  }
}

/** Ruční zařazení nahradí výsledek parseru; štítky („CZ dabing“…) zůstanou z názvu souboru. */
function applyClassification(parsed: ParsedName, manual: FileClassification): ParsedName {
  const base = { ...parsed, title: manual.title, alternativeTitle: null, year: manual.year }
  return manual.kind === 'movie'
    ? { ...base, kind: 'movie', season: null, episode: null, episodeEnd: null, episodeTitle: null }
    : {
        ...base,
        kind: 'episode',
        season: manual.season,
        episode: manual.episode,
        episodeEnd: null,
        episodeTitle: manual.episodeTitle
      }
}

/**
 * Rozdělí soubory na filmy a seriály (díly seskupené podle názvu seriálu, série a čísla dílu).
 * `manual` = ruční zařazení souborů, které má přednost před rozpoznáním z názvu.
 */
export function groupMediaFiles(
  files: readonly FileForGrouping[],
  manual: ReadonlyMap<number, FileClassification> = new Map()
): Grouping {
  const parsed = new Map<number, ParsedName>()
  const movieFiles = new Map<string, { names: string[]; years: (number | null)[]; ids: number[] }>()
  const episodeFiles: { id: number; name: ParsedName; keys: string[] }[] = []
  const union = new KeyUnion()

  for (const file of files) {
    const override = manual.get(file.id)
    const auto = parseMediaPath(file.relativePath)
    const name = override ? applyClassification(auto, override) : auto
    parsed.set(file.id, name)
    if (name.kind === 'movie') {
      const key = `${normalizeTitle(name.title)}|${name.year ?? ''}`
      const entry = movieFiles.get(key) ?? { names: [], years: [], ids: [] }
      entry.names.push(name.title)
      entry.years.push(name.year)
      entry.ids.push(file.id)
      movieFiles.set(key, entry)
    } else {
      const keys = [name.title, name.alternativeTitle]
        .filter((title): title is string => Boolean(title))
        .map(normalizeTitle)
        .filter(Boolean)
      if (keys.length === 0) keys.push(normalizeTitle(UNKNOWN_SHOW))
      union.union(keys)
      episodeFiles.push({ id: file.id, name, keys })
    }
  }

  const movies: MovieGroup[] = [...movieFiles].map(([key, entry]) => ({
    kind: 'movie',
    key,
    name: pickDisplayName(entry.names),
    year: entry.years[0] ?? null,
    fileIds: entry.ids
  }))

  const byRoot = new Map<string, typeof episodeFiles>()
  for (const file of episodeFiles) {
    const root = union.find(file.keys[0]!)
    byRoot.set(root, [...(byRoot.get(root) ?? []), file])
  }

  const shows: ShowGroup[] = [...byRoot.values()].map((group) => {
    const primaryKeys = group.map((file) => normalizeTitle(file.name.title || UNKNOWN_SHOW))
    const key = [...new Set(primaryKeys)].sort(
      (a, b) =>
        primaryKeys.filter((k) => k === b).length - primaryKeys.filter((k) => k === a).length ||
        a.localeCompare(b)
    )[0]!
    const name = pickDisplayName(
      group
        .filter((file) => normalizeTitle(file.name.title || UNKNOWN_SHOW) === key)
        .map((file) => file.name.title || UNKNOWN_SHOW)
    )

    const alternatives = new Map<string, string>()
    for (const file of group) {
      for (const title of [file.name.title, file.name.alternativeTitle]) {
        if (title && normalizeTitle(title) !== key && !alternatives.has(normalizeTitle(title))) {
          alternatives.set(normalizeTitle(title), title)
        }
      }
    }

    const episodes = new Map<string, EpisodeGroup>()
    for (const file of group) {
      const season = file.name.season ?? 1
      const number = file.name.episode ?? 0
      const id = `${season}x${number}`
      const episode = episodes.get(id) ?? { season, episode: number, name: null, fileIds: [] }
      episode.name ??= file.name.episodeTitle
      episode.fileIds.push(file.id)
      episodes.set(id, episode)
    }

    return {
      kind: 'show' as const,
      key,
      keys: [...new Set(group.flatMap((file) => file.keys))].sort(),
      name,
      alternativeNames: [...alternatives.values()],
      year: mostFrequent(group.map((file) => file.name.year).filter((y) => y !== null)) ?? null,
      episodes: [...episodes.values()].sort((a, b) => a.season - b.season || a.episode - b.episode)
    }
  })

  return { movies, shows, parsed }
}
