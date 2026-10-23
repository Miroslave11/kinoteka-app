import { describe, expect, it, vi } from 'vitest'
import { buildCsfdQuery, csfdIdsFromWikidata, WIKIDATA_USER_AGENT } from './wikidata'

const sparql = (rows: [string, string][]): Response =>
  new Response(
    JSON.stringify({
      results: {
        bindings: rows.map(([tmdb, csfd]) => ({ tmdb: { value: tmdb }, csfd: { value: csfd } }))
      }
    })
  )

describe('WIKIDATA_USER_AGENT', () => {
  it('obsahuje jen znaky povolené v hlavičce HTTP', () => {
    expect(WIKIDATA_USER_AGENT).toMatch(/^[ -~]+$/)
  })
})

describe('buildCsfdQuery', () => {
  it('film přes P4947, seriál přes P4983, ID z ČSFD přes P2529', () => {
    expect(buildCsfdQuery('movie', [7229, 1284041])).toBe(
      'SELECT ?tmdb ?csfd WHERE { VALUES ?tmdb { "7229" "1284041" } ?item wdt:P4947 ?tmdb ; wdt:P2529 ?csfd . }'
    )
    expect(buildCsfdQuery('show', [4614])).toContain('wdt:P4983')
  })
})

describe('csfdIdsFromWikidata', () => {
  it('vrátí nalezená ID a pošle popisný User-Agent', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      sparql([
        ['7229', '117181'],
        ['1284041', '1680696'],
        ['1284041', '999']
      ])
    )
    const ids = await csfdIdsFromWikidata(
      'movie',
      [7229, 1284041, 42],
      fetchImpl,
      'http://wd.test/sparql'
    )
    expect([...ids]).toEqual([
      [7229, 117181],
      [1284041, 1680696]
    ])
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toMatch(/^http:\/\/wd\.test\/sparql\?query=/)
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe(WIKIDATA_USER_AGENT)
  })

  it('velký počet titulů rozdělí do dávek po 50', async () => {
    const fetchImpl = vi.fn(async () => sparql([]))
    await csfdIdsFromWikidata(
      'movie',
      Array.from({ length: 120 }, (_, i) => i + 1),
      fetchImpl
    )
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('chybu Wikidata předá dál', async () => {
    await expect(
      csfdIdsFromWikidata('show', [1], async () => new Response('', { status: 503 }))
    ).rejects.toThrow('HTTP 503')
  })
})
