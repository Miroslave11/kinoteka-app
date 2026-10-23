import { describe, expect, it } from 'vitest'
import { MOVIE_PRAZDNOTA, SEARCH_PRAZDNOTA, SEASON_VIDIM_VAS_1, SHOW_VIDIM_VAS } from './fixtures'
import { imageUrl, mapMovie, mapSearchResults, mapShow, seasonNumbers } from './mapping'

describe('mapMovie', () => {
  const movie = mapMovie(MOVIE_PRAZDNOTA)

  it('převede základní údaje', () => {
    expect(movie).toMatchObject({
      tmdbId: 9001,
      kind: 'movie',
      name: 'Prázdnota',
      originalName: 'The Void',
      year: 2020,
      runtimeMin: 137,
      rating: 6.8,
      genres: ['Horor', 'Mysteriózní'],
      directors: ['Režisér Jedna'],
      tmdbUrl: 'https://www.themoviedb.org/movie/9001'
    })
    expect(movie.countries[0]).toMatch(/Spojené státy/)
  })

  it('vybere pozadí bez textu, logo jako PNG a oficiální trailer', () => {
    expect(movie.backdropUrl).toBe('kinoteka-media://tmdb/w1280/prazdnota-backdrop.jpg')
    expect(movie.logoUrl).toBe('kinoteka-media://tmdb/w500/prazdnota-logo.png')
    expect(movie.posterUrl).toBe('kinoteka-media://tmdb/w500/prazdnota-poster.jpg')
    expect(movie.trailerUrl).toBe('https://www.youtube.com/watch?v=trailerEN')
  })

  it('herci s fotkou i bez ní', () => {
    expect(movie.cast).toEqual([
      { name: 'Herec Jedna', role: 'Daniel', photoUrl: 'kinoteka-media://tmdb/w185/herec1.jpg' },
      { name: 'Herečka Dvě', role: 'Alison', photoUrl: null }
    ])
  })
})

describe('mapShow', () => {
  const show = mapShow(SHOW_VIDIM_VAS, [SEASON_VIDIM_VAS_1])

  it('převede seriál včetně tvůrců, českého loga a českého traileru', () => {
    expect(show).toMatchObject({
      kind: 'show',
      name: 'Vidím vás',
      originalName: 'The Watcher',
      year: 2022,
      runtimeMin: 48,
      directors: ['Tvůrce Jedna', 'Tvůrce Dva'],
      logoUrl: 'kinoteka-media://tmdb/w500/watcher-logo-cs.png',
      trailerUrl: 'https://www.youtube.com/watch?v=czTrailer',
      tmdbUrl: 'https://www.themoviedb.org/tv/9100'
    })
  })

  it('díly série s náhledy', () => {
    expect(show.seasons).toHaveLength(1)
    expect(show.seasons[0]!.episodes.map((e) => [e.number, e.name, e.stillUrl])).toEqual([
      [1, 'Vítejte doma', 'kinoteka-media://tmdb/w300/w1.jpg'],
      [2, 'Sousedé', 'kinoteka-media://tmdb/w300/w2.jpg'],
      [3, 'Dopisy', null]
    ])
  })

  it('série k načtení bez speciálů', () => {
    expect(seasonNumbers(SHOW_VIDIM_VAS)).toEqual([1])
  })
})

describe('imageUrl', () => {
  it('odmítne podezřelé cesty', () => {
    expect(imageUrl('w500', '/../../etc/passwd')).toBeNull()
    expect(imageUrl('w500', 'bez-lomitka.jpg')).toBeNull()
    expect(imageUrl('w500', null)).toBeNull()
  })
})

describe('mapSearchResults', () => {
  it('výsledky pro dialog Opravit shodu', () => {
    expect(mapSearchResults(SEARCH_PRAZDNOTA, 'movie')).toEqual([
      {
        tmdbId: 9000,
        kind: 'movie',
        name: 'Prázdnota',
        originalName: 'Emptiness',
        year: 2003,
        overview: null,
        posterThumbUrl: null
      },
      {
        tmdbId: 9001,
        kind: 'movie',
        name: 'Prázdnota',
        originalName: 'The Void',
        year: 2020,
        overview: null,
        posterThumbUrl: 'kinoteka-media://tmdb/w185/prazdnota-poster.jpg'
      }
    ])
  })
})
