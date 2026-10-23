import { episodeCode } from './playback'

/** Záznam v deníku: jedno zhlédnutí filmu, dílu (nebo ručně celého seriálu). */
export interface JournalEntry {
  id: number
  titleId: number
  kind: 'movie' | 'show'
  /** Název k zobrazení (český z TMDB, jinak z názvu souboru). */
  titleName: string
  year: number | null
  posterUrl: string | null
  /** Díl seriálu; null = film nebo celý seriál. */
  episode: { id: number; season: number; episode: number; name: string | null } | null
  /** ISO čas zhlédnutí. */
  watchedAt: string
  /** auto = přehrávač (nad 90 %), manual = „Viděl jsem“. */
  source: 'auto' | 'manual'
  note: string | null
  /** Moje hodnocení titulu 1–5; null = bez hodnocení. */
  rating: number | null
  /** Kolikáté zhlédnutí tohoto filmu nebo dílu (1 = první). */
  ordinal: number
  /** Délka v minutách (ze souboru nebo z TMDB); null = neznámá. */
  runtimeMin: number | null
  /** Titul je v knihovně (má soubory). */
  inLibrary: boolean
}

/** Nový ruční záznam „Viděl jsem“. */
export interface ManualEntry {
  titleId: number
  /** Díly seriálu; prázdné = film nebo celý seriál. */
  episodeIds: number[]
  watchedAt: string
  note: string | null
}

export const isRating = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

const cleanNote = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 2000) : null

export function parseManualEntry(value: unknown): ManualEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  if (!Number.isInteger(input['titleId']) || !isIsoDate(input['watchedAt'])) return null
  const episodeIds = Array.isArray(input['episodeIds']) ? input['episodeIds'] : []
  if (!episodeIds.every((id) => Number.isInteger(id))) return null
  return {
    titleId: input['titleId'] as number,
    episodeIds: episodeIds as number[],
    watchedAt: new Date(input['watchedAt']).toISOString(),
    note: cleanNote(input['note'])
  }
}

/** Úprava záznamu: datum a poznámka. */
export function parseEntryUpdate(
  value: unknown
): { watchedAt?: string; note?: string | null } | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const update: { watchedAt?: string; note?: string | null } = {}
  if ('watchedAt' in input) {
    if (!isIsoDate(input['watchedAt'])) return null
    update.watchedAt = new Date(input['watchedAt']).toISOString()
  }
  if ('note' in input) update.note = cleanNote(input['note'])
  return update
}

/** „Země gangů · S01E02 · Puzzle“ nebo jen název filmu. */
export function entryLabel(entry: JournalEntry): string {
  if (!entry.episode) return entry.titleName
  const { season, episode, name } = entry.episode
  return [entry.titleName, episodeCode(season, episode), name].filter(Boolean).join(' · ')
}

export type JournalKind = 'all' | 'movie' | 'show'
/** Hodnocení: konkrétní počet hvězd, „bez hodnocení“, nebo vše. */
export type JournalRatingFilter = 'all' | 'none' | 1 | 2 | 3 | 4 | 5

export function filterJournal(
  entries: JournalEntry[],
  kind: JournalKind,
  rating: JournalRatingFilter
): JournalEntry[] {
  return entries.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      (rating === 'all' || (rating === 'none' ? e.rating === null : e.rating === rating))
  )
}

export interface JournalStats {
  moviesThisYear: number
  episodesThisYear: number
  /** Průměr mého hodnocení přes ohodnocené tituly v deníku; null = žádné. */
  averageRating: number | null
  /** Celkový čas všech zhlédnutí v hodinách (jen záznamy se známou délkou). */
  totalHours: number
}

export function journalStats(entries: JournalEntry[], now = new Date()): JournalStats {
  const year = String(now.getFullYear())
  const thisYear = entries.filter((e) => new Date(e.watchedAt).getFullYear() === Number(year))
  const ratings = new Map<number, number>()
  for (const entry of entries) if (entry.rating !== null) ratings.set(entry.titleId, entry.rating)
  const minutes = entries.reduce((sum, e) => sum + (e.runtimeMin ?? 0), 0)
  return {
    moviesThisYear: thisYear.filter((e) => e.kind === 'movie').length,
    episodesThisYear: thisYear.filter((e) => e.episode !== null).length,
    averageRating:
      ratings.size > 0 ? [...ratings.values()].reduce((a, b) => a + b, 0) / ratings.size : null,
    totalHours: Math.round(minutes / 60)
  }
}

/** Záznamy po měsících („říjen 2026“), nejnovější první. */
export function groupByMonth(
  entries: JournalEntry[]
): { month: string; entries: JournalEntry[] }[] {
  const groups = new Map<string, JournalEntry[]>()
  for (const entry of [...entries].sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))) {
    const month = new Date(entry.watchedAt).toLocaleDateString('cs-CZ', {
      month: 'long',
      year: 'numeric'
    })
    groups.set(month, [...(groups.get(month) ?? []), entry])
  }
  return [...groups].map(([month, list]) => ({ month, entries: list }))
}
