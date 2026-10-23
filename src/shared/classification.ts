/** Kam soubor patří: film, nebo díl seriálu. Ruční zařazení přepíše rozpoznání z názvu souboru. */
export type FileClassification =
  | { kind: 'movie'; title: string; year: number | null }
  | {
      kind: 'episode'
      /** Název seriálu – shodný název souboru připojí díl k existujícímu seriálu. */
      title: string
      year: number | null
      season: number
      episode: number
      episodeTitle: string | null
    }

/** Zařazení souboru v okně Vlastnosti souboru. */
export interface ClassificationInfo {
  current: FileClassification
  /** Zařazeno ručně (jinak automaticky z názvu souboru). */
  manual: boolean
}

/** Kde soubor po změně zařazení skončil – okno přejde na jeho detail. */
export interface ClassificationResult {
  titleId: number
  kind: 'movie' | 'show'
}

const cleanText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null

const intIn = (value: unknown, min: number, max: number): number | null =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : null

/** Ověří zařazení z okna; neplatné = null. */
export function parseClassification(value: unknown): FileClassification | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const title = cleanText(input['title'])
  if (!title) return null
  const year =
    input['year'] === null || input['year'] === undefined ? null : intIn(input['year'], 1880, 2100)
  if (year === null && input['year'] !== null && input['year'] !== undefined) return null
  if (input['kind'] === 'movie') return { kind: 'movie', title, year }
  if (input['kind'] !== 'episode') return null
  const season = intIn(input['season'], 0, 999)
  const episode = intIn(input['episode'], 0, 9999)
  if (season === null || episode === null) return null
  return {
    kind: 'episode',
    title,
    year,
    season,
    episode,
    episodeTitle: cleanText(input['episodeTitle'])
  }
}

/** „Film: Prázdnota (2020)“, „Seriál Země gangů · S01E02“. */
export function describeClassification(classification: FileClassification): string {
  const year = classification.year ? ` (${classification.year})` : ''
  if (classification.kind === 'movie') return `Film: ${classification.title}${year}`
  const code = `S${String(classification.season).padStart(2, '0')}E${String(classification.episode).padStart(2, '0')}`
  return `Seriál ${classification.title}${year} · ${code}${classification.episodeTitle ? ` · ${classification.episodeTitle}` : ''}`
}
