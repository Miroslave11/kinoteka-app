/**
 * Wikidata páruje TMDB ID s ID z ČSFD (vlastnost P2529), takže na ČSFD není potřeba nic vyhledávat.
 * https://www.wikidata.org/wiki/Property:P2529
 */
export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql'

/** Wikimedia vyžaduje popisný User-Agent s kontaktem. Hlavičky HTTP smí obsahovat jen ASCII. */
export const WIKIDATA_USER_AGENT =
  'Kinoteka/0.1 (personal movie library; https://github.com/Miroslave11/kinoteka)'

/** TMDB movie ID (P4947) a TMDB TV series ID (P4983). */
const TMDB_PROPERTY = { movie: 'P4947', show: 'P4983' } as const

/** Nejvýš tolik ID v jednom dotazu. */
export const WIKIDATA_BATCH = 50

export function buildCsfdQuery(kind: 'movie' | 'show', tmdbIds: number[]): string {
  const values = tmdbIds.map((id) => `"${Math.trunc(id)}"`).join(' ')
  return `SELECT ?tmdb ?csfd WHERE { VALUES ?tmdb { ${values} } ?item wdt:${TMDB_PROPERTY[kind]} ?tmdb ; wdt:P2529 ?csfd . }`
}

/** TMDB ID → ID z ČSFD; tituly, které Wikidata nezná, ve výsledku chybí. */
export async function csfdIdsFromWikidata(
  kind: 'movie' | 'show',
  tmdbIds: number[],
  fetchImpl: typeof fetch,
  endpoint = WIKIDATA_SPARQL_URL
): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  for (let i = 0; i < tmdbIds.length; i += WIKIDATA_BATCH) {
    const batch = tmdbIds.slice(i, i + WIKIDATA_BATCH)
    const url = new URL(endpoint)
    url.searchParams.set('query', buildCsfdQuery(kind, batch))
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': WIKIDATA_USER_AGENT
      }
    })
    if (!response.ok) throw new Error(`Wikidata vrátila chybu HTTP ${response.status}`)
    const json = (await response.json()) as {
      results?: { bindings?: { tmdb?: { value: string }; csfd?: { value: string } }[] }
    }
    for (const binding of json.results?.bindings ?? []) {
      const tmdb = Number(binding.tmdb?.value)
      const csfd = Number(binding.csfd?.value)
      // Jeden titul může mít na Wikidata víc ID (sloučené stránky) – platí první.
      if (Number.isInteger(tmdb) && Number.isInteger(csfd) && csfd > 0 && !result.has(tmdb)) {
        result.set(tmdb, csfd)
      }
    }
  }
  return result
}
