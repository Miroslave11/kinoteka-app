/** Údaje o filmu nebo seriálu z TMDB. Obrázky jsou URL do lokální cache (`kinoteka-media://`). */
export interface TitleMetadata {
  tmdbId: number
  /** ID na IMDb („tt0310203“) – podle něj se páruje hodnocení z IMDb. */
  imdbId: string | null
  kind: 'movie' | 'show'
  /** Název podle TMDB v češtině (pokud existuje). */
  name: string
  originalName: string | null
  year: number | null
  overview: string | null
  tagline: string | null
  genres: string[]
  countries: string[]
  /** Délka filmu, u seriálu typická délka dílu. */
  runtimeMin: number | null
  /** Hodnocení TMDB 0–10. */
  rating: number | null
  posterUrl: string | null
  backdropUrl: string | null
  /** Logo názvu (průhledný obrázek) – v Plexu místo textového nadpisu. */
  logoUrl: string | null
  cast: Person[]
  /** Režie (u seriálů tvůrci). */
  directors: string[]
  trailerUrl: string | null
  tmdbUrl: string
  /** Jen seriály: série a díly podle TMDB (i ty, které na disku nejsou). */
  seasons: MetadataSeason[]
  /** Jen seriály: jestli se ještě vysílá a kdy vyjde další díl. Starší uložené údaje ho nemají. */
  airing?: ShowAiring
}

/** Stav vysílání seriálu podle TMDB. */
export interface ShowAiring {
  /** running = pokračuje nebo se chystá, ended = skončil, canceled = zrušen. */
  status: 'running' | 'ended' | 'canceled'
  /** Nejbližší ohlášený díl. */
  nextEpisode: AiringEpisode | null
}

export interface AiringEpisode {
  season: number
  episode: number
  name: string | null
  /** Datum původní premiéry (RRRR-MM-DD). */
  airDate: string
}

export interface Person {
  name: string
  role: string | null
  photoUrl: string | null
}

export interface MetadataSeason {
  number: number
  name: string
  episodes: MetadataEpisode[]
}

export interface MetadataEpisode {
  number: number
  name: string | null
  overview: string | null
  stillUrl: string | null
  airDate: string | null
  runtimeMin: number | null
}

/**
 * pending   – čeká na dohledání
 * matched   – dohledáno automaticky
 * manual    – vybráno ručně („Opravit shodu“)
 * unmatched – nic odpovídajícího nenalezeno
 * error     – chyba sítě nebo TMDB, zkusí se znovu
 * disabled  – chybí klíč TMDB
 */
/** `course` = vzdělávací kurz, na TMDB se nedohledává (lze ručně přes Opravit shodu). */
export type MatchStatus =
  'pending' | 'matched' | 'manual' | 'unmatched' | 'error' | 'disabled' | 'course'

/** Výsledek vyhledávání pro dialog „Opravit shodu“. */
export interface MetadataSearchResult {
  tmdbId: number
  kind: 'movie' | 'show'
  name: string
  originalName: string | null
  year: number | null
  overview: string | null
  /** Malý náhled plakátu přímo z TMDB (jen pro dialog). */
  posterThumbUrl: string | null
}

export type TmdbKeyStatus =
  { configured: false } | { configured: true; valid: boolean | null; checkedAt: string | null }

export type ActionResult = { ok: true } | { ok: false; message: string }
export type SaveKeyResult = ActionResult

/** Hodnocení z IMDb (oficiální datový soubor title.ratings). */
export interface ImdbRating {
  id: string
  /** 1–10 */
  rating: number
  votes: number
}

export interface ImdbStatus {
  enabled: boolean
  /** Kdy se naposledy stáhl datový soubor IMDb. */
  downloadedAt: string | null
  /** Kdy IMDb soubor naposledy vydalo (hlavička Last-Modified). */
  datasetDate: string | null
  /** Tituly s IMDb ID / z toho s hodnocením. */
  titles: number
  rated: number
  updating: boolean
  error: string | null
}

export const IMDB_TITLE_URL = 'https://www.imdb.com/title/'

/** Podmínky IMDb pro datové soubory vyžadují toto uvedení zdroje. */
export const IMDB_ATTRIBUTION =
  'Information courtesy of IMDb (https://www.imdb.com). Used with permission.'

/** 1 234 567 → „1,2 mil.“, 45 300 → „45 tis.“ */
export function formatVotes(votes: number): string {
  if (votes >= 1_000_000) {
    return `${(votes / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil.`
  }
  if (votes >= 1000) return `${Math.round(votes / 1000).toLocaleString('cs-CZ')} tis.`
  return String(votes)
}

/** TMDB vyžaduje v aplikaci uvést zdroj dat. */
export const TMDB_ATTRIBUTION =
  'Tento produkt používá TMDB API, ale není schválen ani certifikován společností TMDB.'

/** Odkaz z webu TMDB („https://www.themoviedb.org/tv/123-nazev“) → druh a id. */
export function parseTmdbUrl(text: string): { kind: 'movie' | 'show'; tmdbId: number } | null {
  const match = /themoviedb\.org\/(movie|tv)\/(\d+)/i.exec(text)
  if (!match) return null
  return { kind: match[1]!.toLowerCase() === 'tv' ? 'show' : 'movie', tmdbId: Number(match[2]) }
}
