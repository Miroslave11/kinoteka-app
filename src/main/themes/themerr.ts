import { parseYoutubeUrl } from '../../shared/kids'

/**
 * ThemerrDB – komunitní databáze ústředních melodií (používají ji doplňky Themerr pro Plex
 * a Jellyfin). Ke každému filmu a seriálu podle ID z TMDB vrací odkaz na video z YouTube.
 */
export const THEMERR_URL = 'https://app.lizardbyte.dev/ThemerrDB'

/**
 * Odkaz na melodii titulu; null = ThemerrDB ji nezná. Při chybě sítě nebo serveru vyhodí
 * výjimku – titul se pak zkusí znovu, místo aby se zapsal jako „bez melodie“.
 */
export async function themerrYoutubeUrl(
  fetchImpl: typeof fetch,
  kind: 'movie' | 'show',
  tmdbId: number,
  baseUrl = THEMERR_URL
): Promise<string | null> {
  const response = await fetchImpl(
    `${baseUrl}/${kind === 'movie' ? 'movies' : 'tv_shows'}/themoviedb/${tmdbId}.json`,
    { signal: AbortSignal.timeout(30_000) }
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`ThemerrDB odpověděla ${response.status}`)
  const json = (await response.json()) as Record<string, unknown>
  const link = json['youtube_theme_url']
  return typeof link === 'string' ? parseYoutubeUrl(link) : null
}
