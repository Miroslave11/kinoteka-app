import type {
  MetadataEpisode,
  MetadataSeason,
  MetadataSearchResult,
  Person,
  TitleMetadata
} from '../../shared/metadata'

type Json = Record<string, unknown>

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : [])
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {}
const yearOf = (date: unknown): number | null => {
  const text = str(date)
  return text && /^\d{4}/.test(text) ? Number(text.slice(0, 4)) : null
}

/**
 * Obrázky se neukládají předem: URL míří do vlastního protokolu, který obrázek
 * při prvním zobrazení stáhne z TMDB a uloží do cache.
 */
export function imageUrl(size: string, path: unknown): string | null {
  const file = str(path)
  return file && /^\/[\w.-]+$/.test(file) ? `kinoteka-media://tmdb/${size}${file}` : null
}

const regionNames = new Intl.DisplayNames(['cs'], { type: 'region' })
const countryName = (code: string): string => {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

/** Z obrázků vybere ten v preferovaném jazyce s nejvyšším hodnocením. */
function pickImage(
  images: Json[],
  languages: (string | null)[],
  filter?: (path: string) => boolean
): string | null {
  for (const language of languages) {
    const candidates = images
      .filter((image) => (image['iso_639_1'] ?? null) === language)
      .filter((image) => !filter || filter(String(image['file_path'] ?? '')))
      .sort((a, b) => (num(b['vote_average']) ?? 0) - (num(a['vote_average']) ?? 0))
    const path = str(candidates[0]?.['file_path'])
    if (path) return path
  }
  return null
}

function trailer(videos: Json[]): string | null {
  const trailers = videos.filter(
    (v) => v['site'] === 'YouTube' && v['type'] === 'Trailer' && str(v['key'])
  )
  const best =
    trailers.find((v) => v['iso_639_1'] === 'cs') ??
    trailers.find((v) => v['official'] === true) ??
    trailers[0]
  return best ? `https://www.youtube.com/watch?v=${String(best['key'])}` : null
}

function castOf(credits: Json): Person[] {
  return list(credits['cast'])
    .slice(0, 12)
    .map((person) => ({
      name: String(person['name'] ?? ''),
      role: str(person['character']),
      photoUrl: imageUrl('w185', person['profile_path'])
    }))
    .filter((person) => person.name)
}

function common(json: Json, kind: 'movie' | 'show'): TitleMetadata {
  const images = obj(json['images'])
  const name = str(json['title'] ?? json['name']) ?? ''
  const original = str(json['original_title'] ?? json['original_name'])
  const countries = list(json['production_countries'])
    .map((c) => str(c['iso_3166_1']))
    .concat(Array.isArray(json['origin_country']) ? (json['origin_country'] as string[]) : [])
    .filter((c): c is string => Boolean(c))
  // Film má imdb_id přímo, seriál jen v external_ids.
  const imdbId = str(json['imdb_id']) ?? str(obj(json['external_ids'])['imdb_id'])
  return {
    tmdbId: Number(json['id']),
    imdbId: imdbId && /^tt\d+$/.test(imdbId) ? imdbId : null,
    kind,
    name,
    originalName: original && original !== name ? original : null,
    year: yearOf(json['release_date'] ?? json['first_air_date']),
    overview: str(json['overview']),
    tagline: str(json['tagline']),
    genres: list(json['genres'])
      .map((g) => String(g['name'] ?? ''))
      .filter(Boolean),
    countries: [...new Set(countries)].map(countryName),
    runtimeMin: null,
    rating: num(json['vote_count']) ? num(json['vote_average']) : null,
    posterUrl: imageUrl(
      'w500',
      json['poster_path'] ?? pickImage(list(images['posters']), ['cs', 'en', null])
    ),
    // Pozadí bez textu (jazyk null) působí lépe než plakátové s nápisy.
    backdropUrl: imageUrl(
      'w1280',
      pickImage(list(images['backdrops']), [null, 'cs', 'en']) ?? json['backdrop_path']
    ),
    logoUrl: imageUrl(
      'w500',
      pickImage(list(images['logos']), ['cs', 'en', null], (p) => p.endsWith('.png'))
    ),
    cast: castOf(obj(json['credits'])),
    directors: [],
    trailerUrl: trailer(list(obj(json['videos'])['results'])),
    tmdbUrl: `https://www.themoviedb.org/${kind === 'movie' ? 'movie' : 'tv'}/${String(json['id'])}`,
    seasons: []
  }
}

export function mapMovie(json: Json): TitleMetadata {
  const metadata = common(json, 'movie')
  metadata.runtimeMin = num(json['runtime']) || null
  metadata.directors = list(obj(json['credits'])['crew'])
    .filter((person) => person['job'] === 'Director')
    .map((person) => String(person['name'] ?? ''))
    .filter(Boolean)
  return metadata
}

export function mapShow(json: Json, seasons: Json[]): TitleMetadata {
  const metadata = common(json, 'show')
  const runtimes = Array.isArray(json['episode_run_time'])
    ? (json['episode_run_time'] as number[])
    : []
  metadata.runtimeMin = runtimes[0] ?? null
  metadata.directors = list(json['created_by'])
    .map((p) => String(p['name'] ?? ''))
    .filter(Boolean)
  metadata.seasons = seasons.map(mapSeason).sort((a, b) => a.number - b.number)
  return metadata
}

export function mapSeason(json: Json): MetadataSeason {
  const number = Number(json['season_number'] ?? 0)
  return {
    number,
    name: str(json['name']) ?? `Série ${number}`,
    episodes: list(json['episodes'])
      .map((e): MetadataEpisode => ({
        number: Number(e['episode_number'] ?? 0),
        name: str(e['name']),
        overview: str(e['overview']),
        stillUrl: imageUrl('w300', e['still_path']),
        airDate: str(e['air_date']),
        runtimeMin: num(e['runtime'])
      }))
      .sort((a, b) => a.number - b.number)
  }
}

/** Čísla sérií k načtení (bez speciálů – série 0). */
export function seasonNumbers(json: Json): number[] {
  return list(json['seasons'])
    .map((season) => Number(season['season_number']))
    .filter((n) => Number.isInteger(n) && n > 0)
}

export function mapSearchResults(json: Json, kind: 'movie' | 'show'): MetadataSearchResult[] {
  return list(json['results']).map((r) => {
    const name = str(r['title'] ?? r['name']) ?? ''
    const original = str(r['original_title'] ?? r['original_name'])
    return {
      tmdbId: Number(r['id']),
      kind,
      name,
      originalName: original && original !== name ? original : null,
      year: yearOf(r['release_date'] ?? r['first_air_date']),
      overview: str(r['overview']),
      posterThumbUrl: imageUrl('w185', r['poster_path'])
    }
  })
}
