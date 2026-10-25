import { describe, expect, it, vi } from 'vitest'
import { themerrYoutubeUrl } from './themerr'

const respond = (status: number, body: unknown = {}): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('themerrYoutubeUrl', () => {
  it('film a seriál hledá ve správné části databáze', async () => {
    const fetchImpl = respond(200, { youtube_theme_url: 'https://youtu.be/SLBACEP6LsI' })
    await themerrYoutubeUrl(fetchImpl, 'movie', 603)
    await themerrYoutubeUrl(fetchImpl, 'show', 1396, 'http://127.0.0.1:9000')
    expect(vi.mocked(fetchImpl).mock.calls.map((call) => call[0])).toEqual([
      'https://app.lizardbyte.dev/ThemerrDB/movies/themoviedb/603.json',
      'http://127.0.0.1:9000/tv_shows/themoviedb/1396.json'
    ])
  })

  it('vrátí odkaz na video v kanonickém tvaru', async () => {
    const fetchImpl = respond(200, { youtube_theme_url: 'https://youtu.be/SLBACEP6LsI' })
    expect(await themerrYoutubeUrl(fetchImpl, 'movie', 603)).toBe(
      'https://www.youtube.com/watch?v=SLBACEP6LsI'
    )
  })

  it('titul, který databáze nezná nebo nemá odkaz, je bez melodie', async () => {
    expect(await themerrYoutubeUrl(respond(404), 'movie', 1)).toBeNull()
    expect(await themerrYoutubeUrl(respond(200, { title: 'X' }), 'movie', 1)).toBeNull()
  })

  it('chyba serveru není „bez melodie“ – vyhodí výjimku', async () => {
    await expect(themerrYoutubeUrl(respond(503), 'movie', 1)).rejects.toThrow('503')
  })
})
