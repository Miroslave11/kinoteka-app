/** Údaje o filmu nebo seriálu z TMDB. Obrázky jsou URL do lokální cache (`kinoteka-media://`). */
export interface TitleMetadata {
  tmdbId: number
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
export type MatchStatus = 'pending' | 'matched' | 'manual' | 'unmatched' | 'error' | 'disabled'

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

/** TMDB vyžaduje v aplikaci uvést zdroj dat. */
export const TMDB_ATTRIBUTION =
  'Tento produkt používá TMDB API, ale není schválen ani certifikován společností TMDB.'

/** Odkaz z webu TMDB („https://www.themoviedb.org/tv/123-nazev“) → druh a id. */
export function parseTmdbUrl(text: string): { kind: 'movie' | 'show'; tmdbId: number } | null {
  const match = /themoviedb\.org\/(movie|tv)\/(\d+)/i.exec(text)
  if (!match) return null
  return { kind: match[1]!.toLowerCase() === 'tv' ? 'show' : 'movie', tmdbId: Number(match[2]) }
}
