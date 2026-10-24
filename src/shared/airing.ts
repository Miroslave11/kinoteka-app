import type { AiringEpisode, TitleMetadata } from './metadata'
import { episodeCode } from './playback'
import { plural } from './plural'

/**
 * Co seriál čeká: další díl, začátek nové série, nebo nic ohlášeného.
 * episode – další díl běžící série, season – první díl nové série.
 */
export type Upcoming =
  | { kind: 'episode' | 'season'; episode: AiringEpisode }
  | { kind: 'unknown' | 'ended' | 'canceled' }

/** Dnešek jako RRRR-MM-DD v místním čase. */
export function localDate(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/**
 * Nejbližší díl, který ještě nevyšel (dnešní se počítá) – ohlášený na TMDB, nebo ze seznamu
 * dílů. Bez údajů o vysílání (film, staré údaje) null.
 */
export function upcomingOf(metadata: TitleMetadata | null, today: string): Upcoming | null {
  const airing = metadata?.airing
  if (!metadata || !airing) return null
  const candidates: AiringEpisode[] = airing.nextEpisode ? [airing.nextEpisode] : []
  for (const season of metadata.seasons) {
    for (const episode of season.episodes) {
      if (episode.airDate) {
        candidates.push({
          season: season.number,
          episode: episode.number,
          name: episode.name,
          airDate: episode.airDate
        })
      }
    }
  }
  const next = candidates
    .filter((c) => c.airDate >= today)
    .sort(
      (a, b) => a.airDate.localeCompare(b.airDate) || a.season - b.season || a.episode - b.episode
    )[0]
  if (next) return { kind: next.episode === 1 ? 'season' : 'episode', episode: next }
  return { kind: airing.status === 'running' ? 'unknown' : airing.status }
}

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000

/** Za kolik dní (0 = dnes). */
export const daysUntil = (airDate: string, today: string): number =>
  Math.round(dayNumber(airDate) - dayNumber(today))

/** „dnes“, „zítra“, „za 3 dny“, „za 12 dní“. */
export function relativeDay(airDate: string, today: string): string {
  const days = daysUntil(airDate, today)
  if (days <= 0) return 'dnes'
  if (days === 1) return 'zítra'
  return `za ${days} ${plural(days, 'den', 'dny', 'dní')}`
}

const ON_WEEKDAY = [
  'v neděli',
  'v pondělí',
  'v úterý',
  've středu',
  've čtvrtek',
  'v pátek',
  'v sobotu'
]

/** „v sobotu 31. 10. 2026 (za 7 dní)“. */
export function airDateText(airDate: string, today: string): string {
  const date = new Date(`${airDate}T12:00:00`)
  return `${ON_WEEKDAY[date.getDay()]} ${date.toLocaleDateString('cs-CZ')} (${relativeDay(airDate, today)})`
}

/** Krátce pod plakát: „S02E05 · zítra“, „S02E05 · 31. 10.“, „Série 3 · 12. 3. 2027“. */
export function upcomingShort(episode: AiringEpisode, today: string): string {
  const what =
    episode.episode === 1 ? `Série ${episode.season}` : episodeCode(episode.season, episode.episode)
  const [year, month, day] = episode.airDate.split('-').map(Number)
  const when =
    daysUntil(episode.airDate, today) <= 1
      ? relativeDay(episode.airDate, today)
      : `${day}. ${month}.${episode.airDate.slice(0, 4) === today.slice(0, 4) ? '' : ` ${year}`}`
  return `${what} · ${when}`
}

/** Věta pro detail seriálu. */
export function upcomingText(upcoming: Upcoming, today: string): string {
  switch (upcoming.kind) {
    case 'episode': {
      const { episode } = upcoming
      const name = episode.name ? ` „${episode.name}“` : ''
      return `Další díl ${episodeCode(episode.season, episode.episode)}${name} vyjde ${airDateText(episode.airDate, today)}`
    }
    case 'season':
      return `Série ${upcoming.episode.season} začne ${airDateText(upcoming.episode.airDate, today)}`
    case 'unknown':
      return 'Seriál pokračuje, termín dalšího dílu zatím není oznámený'
    case 'ended':
      return 'Seriál skončil'
    case 'canceled':
      return 'Seriál byl zrušen'
  }
}
