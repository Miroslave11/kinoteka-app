/**
 * Zkrácené odpovědi TMDB ve tvaru skutečného API (testy a lokální „falešné TMDB“).
 * Názvy odpovídají souborům uživatele; id jsou smyšlená.
 */
export const MOVIE_PRAZDNOTA = {
  id: 9001,
  title: 'Prázdnota',
  original_title: 'The Void',
  release_date: '2020-03-12',
  overview: 'Ilustrační popis filmu Prázdnota z TMDB.',
  tagline: 'Nic není prázdné.',
  runtime: 137,
  vote_average: 6.8,
  vote_count: 1520,
  poster_path: '/prazdnota-poster.jpg',
  backdrop_path: '/prazdnota-backdrop-text.jpg',
  genres: [
    { id: 27, name: 'Horor' },
    { id: 9648, name: 'Mysteriózní' }
  ],
  production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }],
  credits: {
    cast: [
      { name: 'Herec Jedna', character: 'Daniel', profile_path: '/herec1.jpg' },
      { name: 'Herečka Dvě', character: 'Alison', profile_path: null }
    ],
    crew: [
      { name: 'Režisér Jedna', job: 'Director' },
      { name: 'Kameraman', job: 'Director of Photography' }
    ]
  },
  images: {
    backdrops: [
      { file_path: '/prazdnota-backdrop-text.jpg', iso_639_1: 'en', vote_average: 5.5 },
      { file_path: '/prazdnota-backdrop.jpg', iso_639_1: null, vote_average: 5.2 }
    ],
    logos: [
      { file_path: '/prazdnota-logo.svg', iso_639_1: 'en', vote_average: 6 },
      { file_path: '/prazdnota-logo.png', iso_639_1: 'en', vote_average: 5 }
    ],
    posters: []
  },
  videos: {
    results: [
      { site: 'YouTube', type: 'Teaser', key: 'teaser1', iso_639_1: 'en' },
      { site: 'YouTube', type: 'Trailer', key: 'trailerEN', iso_639_1: 'en', official: true }
    ]
  }
}

export const SHOW_VIDIM_VAS = {
  id: 9100,
  name: 'Vidím vás',
  original_name: 'The Watcher',
  first_air_date: '2022-10-13',
  overview: 'Ilustrační popis seriálu z TMDB.',
  episode_run_time: [48],
  vote_average: 6.5,
  vote_count: 800,
  poster_path: '/watcher-poster.jpg',
  origin_country: ['US'],
  genres: [{ id: 9648, name: 'Mysteriózní' }],
  created_by: [{ name: 'Tvůrce Jedna' }, { name: 'Tvůrce Dva' }],
  seasons: [
    { season_number: 0, name: 'Speciály' },
    { season_number: 1, name: 'Série 1' }
  ],
  credits: { cast: [{ name: 'Herečka Tři', character: 'Nora', profile_path: '/herecka3.jpg' }] },
  images: {
    backdrops: [{ file_path: '/watcher-backdrop.jpg', iso_639_1: null, vote_average: 5 }],
    logos: [{ file_path: '/watcher-logo-cs.png', iso_639_1: 'cs', vote_average: 1 }],
    posters: []
  },
  videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'czTrailer', iso_639_1: 'cs' }] }
}

export const SEASON_VIDIM_VAS_1 = {
  season_number: 1,
  name: 'Série 1',
  episodes: [
    {
      episode_number: 1,
      name: 'Vítejte doma',
      overview: 'Rodina se stěhuje.',
      still_path: '/w1.jpg',
      air_date: '2022-10-13',
      runtime: 58
    },
    {
      episode_number: 2,
      name: 'Sousedé',
      overview: 'Kdo je kdo.',
      still_path: '/w2.jpg',
      air_date: '2022-10-13',
      runtime: 49
    },
    {
      episode_number: 3,
      name: 'Dopisy',
      overview: null,
      still_path: null,
      air_date: '2022-10-13',
      runtime: 52
    }
  ]
}

export const SEARCH_PRAZDNOTA = {
  results: [
    {
      id: 9000,
      title: 'Prázdnota',
      original_title: 'Emptiness',
      release_date: '2003-01-01',
      vote_count: 3,
      poster_path: null
    },
    {
      id: 9001,
      title: 'Prázdnota',
      original_title: 'The Void',
      release_date: '2020-03-12',
      vote_count: 1520,
      poster_path: '/prazdnota-poster.jpg'
    }
  ]
}

export const SEARCH_VIDIM_VAS = {
  results: [
    {
      id: 9100,
      name: 'Vidím vás',
      original_name: 'The Watcher',
      first_air_date: '2022-10-13',
      vote_count: 800,
      poster_path: '/watcher-poster.jpg'
    }
  ]
}
