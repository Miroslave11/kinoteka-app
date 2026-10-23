/** Údaje z ČSFD (česká filmová databáze). */
export interface CsfdData {
  id: number
  url: string
  name: string
  originalName: string | null
  year: number | null
  /** Hodnocení v procentech (0–100); null, když ho ČSFD zatím nemá (film nevyšel, málo hodnocení). */
  rating: number | null
  ratingCount: number | null
  genres: string[]
  countries: string[]
  runtimeMin: number | null
  directors: string[]
  actors: string[]
  plot: string | null
  series: boolean
}

/**
 * pending  – čeká na zjištění ID z ČSFD (přes Wikidata)
 * linked   – ID známé, údaje načtené (nebo se načtou)
 * manual   – propojeno ručně odkazem
 * notfound – Wikidata ID z ČSFD nezná; jde propojit ručně
 * error    – načtení selhalo, zkusí se později
 */
export type CsfdStatus = 'pending' | 'linked' | 'manual' | 'notfound' | 'error'

/** Barva hodnocení jako na ČSFD: červená = dobrý, modrá = průměr, šedá = slabý. */
export function csfdRatingTone(rating: number | null): 'good' | 'average' | 'poor' | 'none' {
  if (rating === null) return 'none'
  if (rating >= 70) return 'good'
  if (rating >= 30) return 'average'
  return 'poor'
}

/** Odkaz na film nebo seriál na ČSFD → id („https://www.csfd.cz/film/117181-drz-hubu/prehled/“ → 117181). */
export function parseCsfdUrl(text: string): number | null {
  const match = /csfd\.(?:cz|sk)\/film\/(\d+)/i.exec(text)
  return match ? Number(match[1]) : null
}
