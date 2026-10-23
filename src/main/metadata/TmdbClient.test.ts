import { describe, expect, it, vi } from 'vitest'
import { describeNetworkError, TmdbClient, TmdbError } from './TmdbClient'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers })

describe('TmdbClient', () => {
  it('klíč v3 posílá jako parametr, s češtinou', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => json({ results: [] }))
    const client = new TmdbClient({ credential: 'abc', fetchImpl, baseUrl: 'http://tmdb.test/3' })
    await client.searchMovie('Prázdnota', 2020)
    const url = new URL(String(fetchImpl.mock.calls[0]![0]))
    expect(url.pathname).toBe('/3/search/movie')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: 'Prázdnota',
      year: '2020',
      language: 'cs-CZ',
      api_key: 'abc'
    })
  })

  it('token v4 posílá v hlavičce Authorization', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json({}))
    const client = new TmdbClient({ credential: 'eyJhbGciOi.token', fetchImpl })
    await client.tv(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect((url as URL).searchParams.has('api_key')).toBe(false)
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer eyJhbGciOi.token'
    )
  })

  it('validate: 401 = neplatný klíč, 200 = platný', async () => {
    const bad = new TmdbClient({ credential: 'x', fetchImpl: async () => json({}, 401) })
    const good = new TmdbClient({ credential: 'x', fetchImpl: async () => json({ success: true }) })
    expect(await bad.validate()).toBe(false)
    expect(await good.validate()).toBe(true)
  })

  it('při HTTP 429 počká a zkusí znovu', async () => {
    vi.useFakeTimers()
    let calls = 0
    const client = new TmdbClient({
      credential: 'x',
      fetchImpl: async () =>
        ++calls === 1 ? json({}, 429, { 'Retry-After': '1' }) : json({ ok: 1 })
    })
    const result = client.movie(5)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toEqual({ ok: 1 })
    expect(calls).toBe(2)
    vi.useRealTimers()
  })

  it('chybu sítě a HTTP chybu převede na TmdbError', async () => {
    const offline = new TmdbClient({
      credential: 'x',
      fetchImpl: async () => {
        throw new Error('ENOTFOUND')
      }
    })
    await expect(offline.movie(1)).rejects.toBeInstanceOf(TmdbError)
    const broken = new TmdbClient({ credential: 'x', fetchImpl: async () => json({}, 500) })
    await expect(broken.movie(1)).rejects.toThrow('HTTP 500')
  })

  it('omezí počet souběžných požadavků', async () => {
    let active = 0
    let peak = 0
    const client = new TmdbClient({
      credential: 'x',
      maxConcurrent: 2,
      fetchImpl: async () => {
        peak = Math.max(peak, ++active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active--
        return json({})
      }
    })
    await Promise.all([1, 2, 3, 4, 5].map((id) => client.movie(id)))
    expect(peak).toBe(2)
  })
})

describe('describeNetworkError', () => {
  it('přidá skutečnou příčinu z error.cause', () => {
    const error = new TypeError('fetch failed', {
      cause: { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' }
    })
    expect(describeNetworkError(error)).toBe('fetch failed (UNABLE_TO_GET_ISSUER_CERT_LOCALLY)')
    expect(describeNetworkError(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(
      'net::ERR_NAME_NOT_RESOLVED'
    )
  })
})
