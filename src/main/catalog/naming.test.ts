import { describe, expect, it } from 'vitest'
import { normalizeTitle, parseMediaPath, type ParsedName } from './naming'

type Expected = Partial<ParsedName>

const check = (path: string, expected: Expected): void => {
  expect(parseMediaPath(path)).toMatchObject(expected)
}

describe('parseMediaPath – skutečné soubory uživatele', () => {
  it.each<[string, Expected]>([
    [
      'Den odhalení (2026) CZ DABING.mkv',
      { kind: 'movie', title: 'Den odhalení', year: 2026, tags: ['CZ dabing'] }
    ],
    [
      'Predátor - Nebezpečné Území 2025 HD (cz titl).mkv',
      {
        kind: 'movie',
        title: 'Predátor - Nebezpečné Území',
        year: 2025,
        tags: ['HD', 'CZ titulky']
      }
    ],
    [
      'Prázdnota (2020) cz dabing.mkv',
      { kind: 'movie', title: 'Prázdnota', year: 2020, tags: ['CZ dabing'] }
    ],
    ['V úkrytu (2026) cz dabing.mkv', { kind: 'movie', title: 'V úkrytu', year: 2026 }],
    [
      'Úkryt nebo past (2026) cz dabing.mkv',
      { kind: 'movie', title: 'Úkryt nebo past', year: 2026 }
    ],
    [
      'Vidim vas - The.Watcher.S01E03.WEBRip.CZ.5.1.mp4',
      {
        kind: 'episode',
        title: 'Vidim vas',
        alternativeTitle: 'The Watcher',
        season: 1,
        episode: 3,
        episodeTitle: null,
        tags: ['WEBRip', 'CZ', '5.1']
      }
    ],
    [
      'Vidím Vás (2022) S01E01 HD CZ Dabing!!!.mkv',
      {
        kind: 'episode',
        title: 'Vidím Vás',
        year: 2022,
        season: 1,
        episode: 1,
        tags: ['HD', 'CZ dabing']
      }
    ],
    [
      'Země gangů S01E01 CZ Dab 2025.mkv',
      {
        kind: 'episode',
        title: 'Země gangů',
        year: 2025,
        season: 1,
        episode: 1,
        tags: ['CZ dabing']
      }
    ],
    [
      'Země gangů S01E03.mkv',
      { kind: 'episode', title: 'Země gangů', season: 1, episode: 3, tags: [] }
    ],
    [
      'Země gangů_S01E02_Puzzle.mp4',
      { kind: 'episode', title: 'Země gangů', season: 1, episode: 2, episodeTitle: 'Puzzle' }
    ]
  ])('%s', check)
})

describe('parseMediaPath – filmy', () => {
  it.each<[string, Expected]>([
    [
      'Inception.2010.1080p.BluRay.x264.mkv',
      { title: 'Inception', year: 2010, tags: ['1080p', 'BluRay'] }
    ],
    ['The.Matrix.1999.2160p.UHD.HDR.DTS-HD.MA.5.1.mkv', { title: 'The Matrix', year: 1999 }],
    ['2001 Vesmírná odysea (1968).mkv', { title: '2001 Vesmírná odysea', year: 1968 }],
    ['1917 (2019).mkv', { title: '1917', year: 2019 }],
    ['1917.mkv', { title: '1917', year: null }],
    ['Blade Runner 2049 (2017) [CZ].mkv', { title: 'Blade Runner 2049', year: 2017 }],
    ['Pelíšky.avi', { title: 'Pelíšky', year: null, tags: [] }],
    ['pelíšky 1999 cz.avi', { title: 'Pelíšky', year: 1999, tags: ['CZ'] }],
    ['Vlk z Wall Street (2013) CZ+EN tit.mkv', { title: 'Vlk z Wall Street', year: 2013 }],
    [
      'Duna.Part.Two.2024.WEB-DL.CZ.dabing.mkv',
      { title: 'Duna Part Two', year: 2024, tags: ['WEB-DL', 'CZ dabing'] }
    ],
    ['Filmy\\Akční\\Rambo (1982).mkv', { title: 'Rambo', year: 1982 }],
    ['Mr. Robot (2015).mkv', { title: 'Mr Robot', year: 2015 }],
    ['Titanic 1997 SK dabing.mkv', { title: 'Titanic', tags: ['SK dabing'] }],
    [
      'Avatar_2009_DV_HDR_2160p.mkv',
      { title: 'Avatar', year: 2009, tags: ['Dolby Vision', 'HDR', '4K'] }
    ],
    ['Joker (2019) [Rip by Někdo] 7.1 Atmos.mkv', { title: 'Joker', tags: ['7.1', 'Atmos'] }],
    ['Gladiator.2000.Extended.Remastered.BDRip.mkv', { title: 'Gladiator', year: 2000 }]
  ])('%s', (path, expected) => check(path, { kind: 'movie', ...expected }))
})

describe('parseMediaPath – seriály', () => {
  it.each<[string, Expected]>([
    ['Breaking.Bad.S05E14.1080p.WEB-DL.mkv', { title: 'Breaking Bad', season: 5, episode: 14 }],
    ['breaking bad s5e14.mkv', { title: 'Breaking bad', season: 5, episode: 14 }],
    [
      'Přátelé 1x02 Ten s ultrazvukem.avi',
      { title: 'Přátelé', season: 1, episode: 2, episodeTitle: 'Ten s ultrazvukem' }
    ],
    [
      'Chernobyl - S01E01 - 1:23:45.mkv',
      { title: 'Chernobyl', season: 1, episode: 1, episodeTitle: '1:23:45' }
    ],
    ['Show.S02E05E06.mkv', { season: 2, episode: 5, episodeEnd: 6 }],
    ['Show S02E05-E06.mkv', { season: 2, episode: 5, episodeEnd: 6 }],
    ['Show S02E05-06.mkv', { season: 2, episode: 5, episodeEnd: 6 }],
    ['Comeback Série 2 Díl 7.avi', { title: 'Comeback', season: 2, episode: 7 }],
    ['Comeback - díl 3.avi', { title: 'Comeback', season: 1, episode: 3 }],
    ['Comeback Epizoda 12.avi', { title: 'Comeback', season: 1, episode: 12 }],
    ['Ulice Ep.105.mp4', { title: 'Ulice', season: 1, episode: 105 }],
    ['Země gangů E05 CZ.mkv', { title: 'Země gangů', season: 1, episode: 5, tags: ['CZ'] }],
    [
      'Seriály\\Země gangů\\Série 2\\01 - Návrat.mkv',
      { title: 'Země gangů', season: 2, episode: 1, episodeTitle: 'Návrat' }
    ],
    ['Seriály\\Země gangů\\Season 03\\S03E04.mkv', { title: 'Země gangů', season: 3, episode: 4 }],
    ['Země gangů (2025)\\S01E02.mkv', { title: 'Země gangů', season: 1, episode: 2 }],
    ['Dark\\Řada 1\\Dark.S01E01.mkv', { title: 'Dark', season: 1, episode: 1 }],
    ['The.Office.US.S03E10.720p.mkv', { title: 'The Office US', season: 3, episode: 10 }]
  ])('%s', (path, expected) => check(path, { kind: 'episode', ...expected }))
})

describe('parseMediaPath – kurzy', () => {
  it.each<[string, Expected]>([
    [
      'AI FIrst kurz/Lekce 01 - Video 2 - Diktování a Handy.mp4',
      {
        kind: 'episode',
        title: 'AI FIrst kurz',
        season: 1,
        episode: 2,
        episodeTitle: 'Diktování a Handy',
        course: true
      }
    ],
    [
      // „web“ jinde znamená štítek WEB – u kurzu zůstane v názvu videa
      'AI FIrst kurz/Lekce 05 - Video 3 - Budujeme větší web from scratch.mp4',
      { season: 5, episode: 3, episodeTitle: 'Budujeme větší web from scratch', tags: [] }
    ],
    [
      'AI FIrst kurz/Lekce 10 - Video 2 - Aplikace za 60 000+ Kč — část 1 z 2.mp4',
      { season: 10, episode: 2, episodeTitle: 'Aplikace za 60 000+ Kč — část 1 z 2' }
    ],
    [
      'Python/Lesson 4 - Loops.mkv',
      {
        kind: 'episode',
        title: 'Python',
        season: 1,
        episode: 4,
        episodeTitle: 'Loops',
        course: true
      }
    ],
    [
      'Kurz fotografie - Modul 2 - Lekce 3 - Světlo.mp4',
      { title: 'Kurz fotografie', season: 2, episode: 3, episodeTitle: 'Světlo', course: true }
    ]
  ])('%s', check)

  it('filmy s „Kapitola“ a běžné seriály kurzem nejsou', () => {
    check('To Kapitola 2 (2019) CZ dabing.mkv', { kind: 'movie', course: false })
    check('John Wick Kapitola 4 (2023).mkv', { kind: 'movie', course: false })
    check('Vidím Vás S01E02.mkv', { kind: 'episode', course: false })
  })
})

describe('normalizeTitle', () => {
  it('sjednotí diakritiku, velikost písmen i oddělovače', () => {
    expect(normalizeTitle('Vidím Vás')).toBe('vidim vas')
    expect(normalizeTitle('Vidim vas')).toBe('vidim vas')
    expect(normalizeTitle('Predátor - Nebezpečné Území')).toBe('predator nebezpecne uzemi')
    expect(normalizeTitle('Tom & Jerry')).toBe('tom a jerry')
    expect(normalizeTitle('ŽLUŤOUČKÝ kůň')).toBe('zlutoucky kun')
  })
})
