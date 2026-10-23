import { normalizeTitle } from '../catalog/naming'

export interface SearchCandidate {
  id: number
  title: string
  originalTitle: string | null
  year: number | null
  voteCount: number
}

/** Pod touto hranicí se shoda nepřijme automaticky (titul zůstane „nedohledáno“). */
export const MATCH_THRESHOLD = 0.6

function nameSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a)
  const y = normalizeTitle(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xs = new Set(x.split(' '))
  const ys = new Set(y.split(' '))
  const common = [...xs].filter((word) => ys.has(word)).length
  const jaccard = common / new Set([...xs, ...ys]).size
  // „Predátor“ vs. „Predátor: Nebezpečné území“ – jeden název obsahuje druhý celý.
  const contained = x.includes(y) || y.includes(x) ? 0.75 : 0
  return Math.max(jaccard, contained)
}

/** Skóre 0–~1.4: podobnost názvu, shoda roku a mírný bonus za známost titulu. */
export function scoreCandidate(
  names: string[],
  year: number | null,
  candidate: SearchCandidate
): number {
  const candidateNames = [candidate.title, candidate.originalTitle].filter((n): n is string =>
    Boolean(n)
  )
  let best = 0
  for (const name of names) {
    for (const candidateName of candidateNames)
      best = Math.max(best, nameSimilarity(name, candidateName))
  }
  let score = best
  if (year !== null && candidate.year !== null) {
    const diff = Math.abs(year - candidate.year)
    score += diff === 0 ? 0.3 : diff === 1 ? 0.15 : -0.4
  }
  score += Math.min(0.1, Math.log10(candidate.voteCount + 1) * 0.025)
  return score
}

/** Nejlepší kandidát, pokud je dost jistý. */
export function pickBestMatch(
  names: string[],
  year: number | null,
  candidates: SearchCandidate[]
): SearchCandidate | null {
  let best: SearchCandidate | null = null
  let bestScore = -Infinity
  for (const candidate of candidates) {
    const score = scoreCandidate(names, year, candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best && bestScore >= MATCH_THRESHOLD ? best : null
}

const yearOf = (date: unknown): number | null =>
  typeof date === 'string' && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null

/** Výsledky vyhledávání TMDB (film i seriál) → kandidáti. */
export function toCandidates(response: Record<string, unknown>): SearchCandidate[] {
  const results = Array.isArray(response['results'])
    ? (response['results'] as Record<string, unknown>[])
    : []
  return results.map((r) => ({
    id: Number(r['id']),
    title: String(r['title'] ?? r['name'] ?? ''),
    originalTitle: (r['original_title'] ?? r['original_name'] ?? null) as string | null,
    year: yearOf(r['release_date'] ?? r['first_air_date']),
    voteCount: Number(r['vote_count'] ?? 0)
  }))
}
