import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { csfdRatingTone, parseCsfdUrl } from '../../shared/csfd'
import { parseCsfd } from './parseCsfd'

/** Zkrácené stránky ČSFD uložené uživatelem (texty děje nahrazené). */
const fixture = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

describe('parseCsfd', () => {
  it('Drž hubu! (2003): hodnocení, původní název, žánry, země, délka, tvůrci', () => {
    expect(parseCsfd(fixture('drz-hubu.html'))).toEqual({
      id: 117181,
      url: 'https://www.csfd.cz/film/117181/prehled/',
      name: 'Drž hubu!',
      originalName: 'Tais-toi !',
      year: 2003,
      rating: 84,
      ratingCount: 60524,
      genres: ['Komedie', 'Krimi'],
      countries: ['Francie', 'Itálie'],
      runtimeMin: 85,
      directors: ['Francis Veber'],
      actors: [
        'Jean Reno',
        'Gérard Depardieu',
        'Jean-Pierre Malo',
        'Richard Berry',
        expect.any(String),
        expect.any(String)
      ],
      plot: expect.stringContaining('Zástupný text děje'),
      series: false
    })
  })

  it('Úkryt nebo past (2026): děj bez odkazu na zdroj, tři země', () => {
    const film = parseCsfd(fixture('ukryt-nebo-past.html'))
    expect(film).toMatchObject({
      id: 1680696,
      name: 'Úkryt nebo past',
      originalName: 'The Last House',
      year: 2026,
      rating: 52,
      ratingCount: 3115,
      genres: ['Akční', 'Horor', 'Sci-Fi'],
      countries: ['Velká Británie', 'Francie', 'USA'],
      runtimeMin: 110,
      directors: ['Louis Leterrier'],
      plot: 'Zástupný text děje pro testy.'
    })
  })

  it('Avengers: Doomsday (2026): zatím bez hodnocení a bez děje', () => {
    const film = parseCsfd(fixture('avengers-doomsday.html'))
    expect(film).toMatchObject({
      id: 1219917,
      name: 'Avengers: Doomsday',
      originalName: null,
      year: 2026,
      rating: null,
      ratingCount: null,
      runtimeMin: 165,
      directors: ['Anthony Russo', 'Joe Russo'],
      plot: null
    })
  })

  it('jiná stránka než film vrátí null', () => {
    expect(parseCsfd('<html><body><h1>Přihlášení</h1></body></html>')).toBeNull()
    expect(parseCsfd('')).toBeNull()
  })

  it('seriál pozná podle hlavičky', () => {
    const html = `<link rel="canonical" href="https://www.csfd.cz/film/168042-ncis/prehled/">
      <div class="film-header-name"><h1>Námořní vyšetřovací služba</h1><span class="type">(seriál)</span></div>
      <div class="origin">USA (2003–2026) 1050 h 12 min (Minutáž: 39–56 min)</div>`
    expect(parseCsfd(html)).toMatchObject({
      id: 168042,
      series: true,
      year: 2003,
      runtimeMin: 63012
    })
  })
})

describe('parseCsfdUrl a csfdRatingTone', () => {
  it('pozná odkaz na film i jeho záložky', () => {
    expect(parseCsfdUrl('https://www.csfd.cz/film/117181-drz-hubu/prehled/')).toBe(117181)
    expect(parseCsfdUrl('csfd.sk/film/1680696-ukryt-nebo-past/recenze/')).toBe(1680696)
    expect(parseCsfdUrl('https://www.themoviedb.org/movie/7229')).toBeNull()
  })

  it('barvy hodnocení jako na ČSFD', () => {
    expect([84, 52, 12, null].map(csfdRatingTone)).toEqual(['good', 'average', 'poor', 'none'])
  })
})
