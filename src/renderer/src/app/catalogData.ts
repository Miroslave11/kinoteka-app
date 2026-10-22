import type { CatalogFile, MovieItem, ShowItem } from '../../../shared/catalog'
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

export type SortKey = 'added' | 'name' | 'year'

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
