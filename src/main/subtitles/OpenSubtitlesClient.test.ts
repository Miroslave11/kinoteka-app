import { describe, expect, it, vi } from 'vitest'
import { OpenSubtitlesClient, OpenSubtitlesError, searchParams } from './OpenSubtitlesClient'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('searchParams', () => {
  it('film: abecedně, IMDb jako číslo, jazyky malými písmeny', () => {
    expect(
      searchParams({
        languages: ['cs', 'EN'],
        moviehash: '8e245d9679d31e12',
        tmdbId: 550,
        imdbId: 'tt0137523'
      }).toString()
    ).toBe('imdb_id=137523&languages=cs%2Cen&moviehash=8e245d9679d31e12&tmdb_id=550')
  })

  it('díl: ID seriálu, série a díl, bez ID samotného dílu', () => {
    expect(
      searchParams({
        languages: ['cs'],
        parentTmdbId: 1399,
        imdbId: 'tt1',
        season: 1,
        episode: 2
      }).toString()
    ).toBe('episode_number=2&languages=cs&parent_tmdb_id=1399&season_number=1')
  })

  it('bez ID hledá podle názvu a roku', () => {
    expect(searchParams({ languages: [], query: 'Úkryt nebo PAST', year: 2026 }).toString()).toBe(
      'query=%C3%BAkryt+nebo+past&year=2026'
    )
  })
})

describe('OpenSubtitlesClient', () => {
  const options = { apiKey: 'klic', userAgent: 'Kinoteka v0.1.0' }

  it('hledá s klíčem API a hlavičkou aplikace', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ data: [{ attributes: { language: 'cs', files: [{ file_id: 5 }] } }] })
    )
    const client = new OpenSubtitlesClient({ ...options, fetchImpl })
    const found = await client.search({ languages: ['cs'], tmdbId: 1 })
    expect(found.map((s) => s.fileId)).toEqual([5])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.opensubtitles.com/api/v1/subtitles?languages=cs&tmdb_id=1')
    expect(init.headers).toMatchObject({ 'Api-Key': 'klic', 'User-Agent': 'Kinoteka v0.1.0' })
  })

  it('stažení s přihlášením: token se použije a zapamatuje', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/login')) return json({ token: 'jwt' })
      if (String(url).endsWith('/download')) {
        return json({ link: 'https://dl.example/x.srt', file_name: 'x.srt', remaining: 19 })
      }
      return new Response('1\n00:00:01,000 --> 00:00:02,000\nAhoj\n')
    })
    const client = new OpenSubtitlesClient({
      ...options,
      username: 'mirek',
      password: 'heslo',
      fetchImpl
    })
    const first = await client.download(9)
    await client.download(10)
    expect(first).toMatchObject({ fileName: 'x.srt', remaining: 19 })
    expect(first.data.toString()).toContain('Ahoj')
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    expect(calls.filter(([url]) => String(url).endsWith('/login'))).toHaveLength(1)
    const download = calls.find(([url]) => String(url).endsWith('/download'))!
    expect(download[1].headers).toMatchObject({ Authorization: 'Bearer jwt' })
    expect(JSON.parse(String(download[1].body))).toEqual({ file_id: 9, sub_format: 'srt' })
  })

  it('bez jména a hesla stahuje bez přihlášení', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/download')
        ? json({ link: 'https://dl.example/y.srt' })
        : new Response('x')
    )
    const client = new OpenSubtitlesClient({ ...options, fetchImpl })
    await client.download(1)
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit?][]
    expect(calls.some(([url]) => String(url).endsWith('/login'))).toBe(false)
    expect(calls[0]![1]!.headers).not.toHaveProperty('Authorization')
  })

  it('chyby API jako srozumitelné zprávy', async () => {
    const respond = (status: number, body: unknown = {}): OpenSubtitlesClient =>
      new OpenSubtitlesClient({ ...options, fetchImpl: async () => json(body, status) })
    await expect(respond(403).search({ languages: [] })).rejects.toThrow(/klíč API/)
    await expect(
      respond(406, { message: 'You have downloaded 5 subtitles' }).download(1)
    ).rejects.toThrow(/limit stažení/)
    await expect(respond(429).search({ languages: [] })).rejects.toBeInstanceOf(OpenSubtitlesError)
    const offline = new OpenSubtitlesClient({
      ...options,
      fetchImpl: async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      }
    })
    await expect(offline.search({ languages: [] })).rejects.toThrow(/není dostupné/)
  })
})
