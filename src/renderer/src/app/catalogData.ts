import type { CatalogFile, EpisodeItem, MovieItem, ShowItem } from '../../../shared/catalog'
import {
  canResume,
  episodeCode,
  type PlaybackProgress,
  type WatchState
} from '../../../shared/playback'
import { normalizeSearch } from '../../../shared/search'

export type TitleItem = ({ kind: 'movie' } & MovieItem) | ({ kind: 'show' } & ShowItem)

export const showFiles = (show: ShowItem): CatalogFile[] =>
  show.seasons.flatMap((season) => season.episodes.flatMap((episode) => episode.files))

export const filesOf = (title: TitleItem): CatalogFile[] =>
  title.kind === 'movie' ? title.files : showFiles(title)

/** Kdy do knihovny přibyl nejnovější soubor titulu. */
export const addedAt = (title: TitleItem): string =>
  filesOf(title).reduce((latest, file) => (file.addedAt > latest ? file.addedAt : latest), '')

/** Soubor, který se přehraje (první dostupný). */
export const playableFile = (files: CatalogFile[]): CatalogFile | undefined =>
  files.find((file) => file.available)

export type SortKey = 'added' | 'name' | 'year' | 'rating'

export interface TitleFilters {
  query: string
  resolution: string | null
  tag: string | null
  sort: SortKey
}

export const DEFAULT_FILTERS: TitleFilters = {
  query: '',
  resolution: null,
  tag: null,
  sort: 'added'
}

/** Filtr a řazení pro mřížky filmů a seriálů. */
export function filterTitles<T extends TitleItem>(titles: T[], filters: TitleFilters): T[] {
  const query = normalizeSearch(filters.query)
  const result = titles.filter((title) => {
    const files = filesOf(title)
    if (query) {
      const names = [title.name, ...(title.kind === 'show' ? title.alternativeNames : [])]
      if (!names.some((name) => normalizeSearch(name).includes(query))) return false
    }
    if (filters.resolution && !files.some((f) => f.summary?.resolution === filters.resolution)) {
      return false
    }
    if (filters.tag && !files.some((f) => f.tags.includes(filters.tag!))) return false
    return true
  })
  const byName = (a: T, b: T): number => a.name.localeCompare(b.name, 'cs')
  return result.sort((a, b) => {
    if (filters.sort === 'name') return byName(a, b)
    if (filters.sort === 'year') return (b.year ?? 0) - (a.year ?? 0) || byName(a, b)
    if (filters.sort === 'rating') {
      return (b.imdb?.rating ?? -1) - (a.imdb?.rating ?? -1) || byName(a, b)
    }
    return addedAt(b).localeCompare(addedAt(a)) || byName(a, b)
  })
}

/** Hodnoty pro filtry, které v knihovně opravdu existují. */
export function filterOptions(titles: TitleItem[]): { resolutions: string[]; tags: string[] } {
  const order = ['4K', '1080p', '720p', 'SD']
  const resolutions = new Set<string>()
  const tags = new Set<string>()
  for (const file of titles.flatMap(filesOf)) {
    if (file.summary) resolutions.add(file.summary.resolution)
    for (const tag of file.tags) if (/dabing|titulky/.test(tag)) tags.add(tag)
  }
  return {
    resolutions: order.filter((r) => resolutions.has(r)),
    tags: [...tags].sort((a, b) => a.localeCompare(b, 'cs'))
  }
}

/** Název k zobrazení: český název z TMDB, jinak z názvu souboru. */
export const displayName = (title: TitleItem): string => title.metadata?.name || title.name

export const displayYear = (title: TitleItem): number | null => title.metadata?.year ?? title.year

export interface EpisodeView {
  season: number
  episode: number
  name: string | null
  overview: string | null
  stillUrl: string | null
  airDate: string | null
  /** Díl na disku; null = díl zná jen TMDB. */
  disk: EpisodeItem | null
}

export interface SeasonView {
  number: number
  name: string
  episodes: EpisodeView[]
}

/** Spojí díly na disku s díly z TMDB – chybějící díly se ukážou šedě. */
export function mergeSeasons(show: ShowItem): SeasonView[] {
  const seasons = new Map<number, SeasonView>()
  const season = (number: number, name?: string): SeasonView => {
    const existing = seasons.get(number)
    if (existing) return existing
    const created = { number, name: name ?? `Série ${number}`, episodes: [] }
    seasons.set(number, created)
    return created
  }

  for (const tmdbSeason of show.metadata?.seasons ?? []) {
    const view = season(tmdbSeason.number, tmdbSeason.name)
    for (const episode of tmdbSeason.episodes) {
      view.episodes.push({
        season: tmdbSeason.number,
        episode: episode.number,
        name: episode.name,
        overview: episode.overview,
        stillUrl: episode.stillUrl,
        airDate: episode.airDate,
        disk: null
      })
    }
  }
  for (const diskSeason of show.seasons) {
    const view = season(diskSeason.number)
    for (const disk of diskSeason.episodes) {
      const known = view.episodes.find((e) => e.episode === disk.episode)
      if (known) {
        known.disk = disk
        known.name ??= disk.name
      } else {
        view.episodes.push({
          season: disk.season,
          episode: disk.episode,
          name: disk.name,
          overview: null,
          stillUrl: null,
          airDate: null,
          disk
        })
      }
    }
  }
  return [...seasons.values()]
    .map((view) => ({ ...view, episodes: view.episodes.sort((a, b) => a.episode - b.episode) }))
    .sort((a, b) => a.number - b.number)
}

// ---------- sledování ----------

/** Díl seriálu s názvem a obrázkem z TMDB (pokud je zná). */
export function episodeLabel(show: ShowItem, episode: EpisodeItem): string {
  const known = show.metadata?.seasons
    .find((s) => s.number === episode.season)
    ?.episodes.find((e) => e.number === episode.episode)
  const name = known?.name ?? episode.name
  return [episodeCode(episode.season, episode.episode), name].filter(Boolean).join(' · ')
}

const episodeStill = (show: ShowItem, episode: EpisodeItem): string | null =>
  show.metadata?.seasons
    .find((s) => s.number === episode.season)
    ?.episodes.find((e) => e.number === episode.episode)?.stillUrl ?? null

export interface UpNext {
  episode: EpisodeItem
  file: CatalogFile
  /** resume = rozkoukaný díl, next = další po zhlédnutém, start = první díl. */
  mode: 'resume' | 'next' | 'start'
  /** Kdy se se seriálem naposledy něco dělo (řazení řady „Pokračovat“). */
  activityAt: string
}

/** Co pustit u seriálu: rozkoukaný díl, další po naposledy zhlédnutém, nebo první díl. */
export function upNext(show: ShowItem): UpNext | null {
  const playable = show.seasons
    .flatMap((season) => season.episodes)
    .map((episode) => ({ episode, file: playableFile(episode.files) }))
    .filter((entry): entry is { episode: EpisodeItem; file: CatalogFile } => !!entry.file)
  const all = show.seasons.flatMap((season) => season.episodes)

  const latest = <T>(items: T[], at: (item: T) => string | null): T | undefined =>
    items.reduce<T | undefined>((best, item) => {
      const time = at(item)
      return time && (!best || time > at(best)!) ? item : best
    }, undefined)

  const inProgress = latest(
    playable.filter((entry) => canResume(entry.episode.watch.progress)),
    (entry) => entry.episode.watch.progress!.updatedAt
  )
  const lastWatched = latest(all, (episode) => episode.watch.lastWatchedAt)
  const watchedAt = lastWatched?.watch.lastWatchedAt ?? null

  if (inProgress && (!watchedAt || inProgress.episode.watch.progress!.updatedAt >= watchedAt)) {
    return {
      ...inProgress,
      mode: 'resume',
      activityAt: inProgress.episode.watch.progress!.updatedAt
    }
  }
  if (lastWatched && watchedAt) {
    const order = (e: EpisodeItem): number => e.season * 10_000 + e.episode
    const next = playable.find((entry) => order(entry.episode) > order(lastWatched))
    if (next) return { ...next, mode: 'next', activityAt: watchedAt }
    return null
  }
  const first = playable[0]
  return first ? { ...first, mode: 'start', activityAt: '' } : null
}

export interface ContinueItem {
  key: string
  title: TitleItem
  fileId: number
  /** U dílu „S01E03 · Název“, u filmu null. */
  episode: string | null
  /** null = další díl, který ještě nezačal. */
  progress: PlaybackProgress | null
  imageUrl: string | null
  activityAt: string
}

/** Řada „Pokračovat ve sledování“: rozkoukané filmy a díly a další díly seriálů. */
export function continueWatching(titles: TitleItem[]): ContinueItem[] {
  const items: ContinueItem[] = []
  for (const title of titles) {
    if (title.kind === 'movie') {
      const file = playableFile(title.files)
      const progress = title.watch.progress
      if (file && canResume(progress)) {
        items.push({
          key: `movie-${title.id}`,
          title,
          fileId: file.id,
          episode: null,
          progress,
          imageUrl: title.metadata?.backdropUrl ?? null,
          activityAt: progress.updatedAt
        })
      }
      continue
    }
    const next = upNext(title)
    if (!next || next.mode === 'start') continue
    items.push({
      key: `show-${title.id}`,
      title,
      fileId: next.file.id,
      episode: episodeLabel(title, next.episode),
      progress: next.mode === 'resume' ? next.episode.watch.progress : null,
      imageUrl: episodeStill(title, next.episode) ?? title.metadata?.backdropUrl ?? null,
      activityAt: next.activityAt
    })
  }
  return items.sort((a, b) => b.activityAt.localeCompare(a.activityAt))
}

/** Film nebo díl, ke kterému patří soubor – pro dialog „Pokračovat ve sledování?“. */
export function watchForFile(
  titles: TitleItem[],
  fileId: number
): { label: string; watch: WatchState } | null {
  for (const title of titles) {
    if (title.kind === 'movie') {
      if (title.files.some((f) => f.id === fileId)) {
        return { label: displayName(title), watch: title.watch }
      }
      continue
    }
    for (const episode of title.seasons.flatMap((s) => s.episodes)) {
      if (episode.files.some((f) => f.id === fileId)) {
        return {
          label: `${displayName(title)} · ${episodeLabel(title, episode)}`,
          watch: episode.watch
        }
      }
    }
  }
  return null
}

/** „Zhlédnuto 21. 10. 2026“, případně „· 2×“. */
export function watchedTitle(watch: WatchState): string {
  const date = watch.lastWatchedAt ? new Date(watch.lastWatchedAt).toLocaleDateString('cs-CZ') : ''
  return `Zhlédnuto ${date}${watch.watchCount > 1 ? ` · ${watch.watchCount}×` : ''}`.trim()
}
