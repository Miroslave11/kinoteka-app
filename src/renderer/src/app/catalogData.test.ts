import { describe, expect, it } from 'vitest'
import type { CatalogFile, EpisodeItem, ShowItem } from '../../../shared/catalog'
import type { TitleMetadata } from '../../../shared/metadata'
import { EMPTY_WATCH_STATE, type WatchState } from '../../../shared/playback'
import {
  continueWatching,
  DEFAULT_FILTERS,
  filterOptions,
  filterTitles,
  mergeSeasons,
  upNext,
  watchForFile,
  type TitleItem
} from './catalogData'

const file = (overrides: Partial<CatalogFile> = {}): CatalogFile => ({
  id: 1,
  fileName: 'x.mkv',
  relativePath: 'x.mkv',
  size: 1,
  available: true,
  tags: [],
  addedAt: '2026-10-01T00:00:00Z',
  summary: null,
  ...overrides
})

const movie = (id: number, name: string, year: number | null, files: CatalogFile[]): TitleItem => ({
  kind: 'movie',
  id,
  name,
  year,
  tags: [],
  files,
  metadata: null,
  matchStatus: 'pending',
  imdb: null,
  palette: null,
  clips: [],
  myRating: null,
  watch: EMPTY_WATCH_STATE
})

const titles: TitleItem[] = [
  movie(1, 'Prázdnota', 2020, [file({ tags: ['CZ dabing'], addedAt: '2026-10-03T00:00:00Z' })]),
  movie(2, 'Predátor - Nebezpečné Území', 2025, [
    file({
      tags: ['CZ titulky'],
      addedAt: '2026-10-01T00:00:00Z',
      summary: { resolution: '4K', hdr: 'HDR10', audio: null, durationSec: 1 }
    })
  ]),
  movie(3, 'Den odhalení', 2026, [
    file({
      tags: ['CZ dabing'],
      addedAt: '2026-10-02T00:00:00Z',
      summary: { resolution: '1080p', hdr: null, audio: null, durationSec: 1 }
    })
  ]),
  {
    kind: 'show',
    id: 4,
    name: 'Vidím Vás',
    year: 2022,
    alternativeNames: ['The Watcher'],
    tags: [],
    seasons: [],
    episodeCount: 0,
    metadata: null,
    matchStatus: 'pending',
    imdb: null,
    palette: null,
    clips: [],
    myRating: null
  }
]

const names = (items: TitleItem[]): string[] => items.map((t) => t.name)

describe('filterTitles', () => {
  it('řadí podle data přidání, názvu i roku', () => {
    const movies = titles.filter((t) => t.kind === 'movie')
    expect(names(filterTitles(movies, DEFAULT_FILTERS))).toEqual([
      'Prázdnota',
      'Den odhalení',
      'Predátor - Nebezpečné Území'
    ])
    expect(names(filterTitles(movies, { ...DEFAULT_FILTERS, sort: 'name' }))).toEqual([
      'Den odhalení',
      'Prázdnota',
      'Predátor - Nebezpečné Území'
    ])
    expect(names(filterTitles(movies, { ...DEFAULT_FILTERS, sort: 'year' }))[0]).toBe(
      'Den odhalení'
    )
  })

  it('vyhledává bez diakritiky a i v alternativních názvech', () => {
    expect(names(filterTitles(titles, { ...DEFAULT_FILTERS, query: 'prazd' }))).toEqual([
      'Prázdnota'
    ])
    expect(names(filterTitles(titles, { ...DEFAULT_FILTERS, query: 'watcher' }))).toEqual([
      'Vidím Vás'
    ])
    expect(filterTitles(titles, { ...DEFAULT_FILTERS, query: 'nic takového' })).toEqual([])
  })

  it('filtruje podle rozlišení a jazykového štítku', () => {
    expect(names(filterTitles(titles, { ...DEFAULT_FILTERS, resolution: '4K' }))).toEqual([
      'Predátor - Nebezpečné Území'
    ])
    expect(
      names(filterTitles(titles, { ...DEFAULT_FILTERS, tag: 'CZ dabing', sort: 'name' }))
    ).toEqual(['Den odhalení', 'Prázdnota'])
  })
})

describe('filterOptions', () => {
  it('nabídne jen hodnoty, které v knihovně existují, v pevném pořadí', () => {
    expect(filterOptions(titles)).toEqual({
      resolutions: ['4K', '1080p'],
      tags: ['CZ dabing', 'CZ titulky']
    })
  })
})

describe('mergeSeasons', () => {
  const episode = (n: number) => ({
    id: n,
    season: 1,
    episode: n,
    name: n === 2 ? 'Puzzle' : null,
    files: [file({ id: n })],
    watch: EMPTY_WATCH_STATE
  })

  it('spojí díly z disku s díly z TMDB a chybějící označí', () => {
    const seasons = mergeSeasons({
      id: 1,
      name: 'Země gangů',
      year: 2025,
      alternativeNames: [],
      tags: [],
      episodeCount: 2,
      seasons: [{ number: 1, episodes: [episode(2), episode(9)] }],
      matchStatus: 'matched',
      imdb: null,
      palette: null,
      clips: [],
      myRating: null,
      metadata: {
        seasons: [
          {
            number: 1,
            name: 'Série 1',
            episodes: [1, 2, 3].map((n) => ({
              number: n,
              name: n === 2 ? null : `Epizoda ${n}`,
              overview: null,
              stillUrl: null,
              airDate: null,
              runtimeMin: null
            }))
          }
        ]
      } as unknown as TitleMetadata
    })
    expect(seasons).toHaveLength(1)
    expect(seasons[0]!.episodes.map((e) => [e.episode, e.name, e.disk !== null])).toEqual([
      [1, 'Epizoda 1', false],
      [2, 'Puzzle', true],
      [3, 'Epizoda 3', false],
      // díl na disku, který TMDB nezná, zůstane
      [9, null, true]
    ])
  })
})

describe('sledování', () => {
  const ep = (season: number, n: number, watch: Partial<WatchState> = {}): EpisodeItem => ({
    id: season * 100 + n,
    season,
    episode: n,
    name: null,
    files: [file({ id: season * 100 + n })],
    watch: { ...EMPTY_WATCH_STATE, ...watch }
  })
  const show = (episodes: EpisodeItem[]): ShowItem & { kind: 'show' } => ({
    kind: 'show',
    id: 9,
    name: 'Země gangů',
    year: 2025,
    alternativeNames: [],
    tags: [],
    seasons: [1, 2]
      .map((number) => ({ number, episodes: episodes.filter((e) => e.season === number) }))
      .filter((season) => season.episodes.length > 0),
    episodeCount: episodes.length,
    metadata: null,
    matchStatus: 'pending',
    imdb: null,
    palette: null,
    clips: [],
    myRating: null
  })
  const progress = (position: number, updatedAt: string): WatchState['progress'] => ({
    position,
    duration: 3000,
    updatedAt
  })

  it('nezačatý seriál začne prvním dílem', () => {
    expect(upNext(show([ep(1, 1), ep(1, 2)]))).toMatchObject({
      mode: 'start',
      episode: { id: 101 }
    })
  })

  it('po zhlédnutém dílu nabídne další, i v další sérii', () => {
    const next = upNext(
      show([ep(1, 1), ep(1, 2, { watchCount: 1, lastWatchedAt: '2026-10-20' }), ep(2, 1)])
    )
    expect(next).toMatchObject({ mode: 'next', episode: { id: 201 } })
  })

  it('rozkoukaný díl má přednost, pokud je novější než poslední zhlédnutí', () => {
    const episodes = [
      ep(1, 1, { progress: progress(600, '2026-10-21') }),
      ep(1, 2, { watchCount: 1, lastWatchedAt: '2026-10-20' }),
      ep(1, 3)
    ]
    expect(upNext(show(episodes))).toMatchObject({ mode: 'resume', episode: { id: 101 } })
    episodes[1]!.watch.lastWatchedAt = '2026-10-22'
    expect(upNext(show(episodes))).toMatchObject({ mode: 'next', episode: { id: 103 } })
  })

  it('dokoukaný seriál nic nenabízí', () => {
    expect(upNext(show([ep(1, 1, { watchCount: 1, lastWatchedAt: '2026-10-20' })]))).toBeNull()
  })

  it('řada Pokračovat: rozkoukané filmy a díly i další díly, nejnovější první', () => {
    const film = {
      ...movie(1, 'Prázdnota', 2020, [file({ id: 5 })]),
      watch: { ...EMPTY_WATCH_STATE, progress: progress(900, '2026-10-19') }
    } as TitleItem
    const finished = {
      ...movie(2, 'Den odhalení', 2026, [file({ id: 6 })]),
      watch: { ...EMPTY_WATCH_STATE, watchCount: 1, lastWatchedAt: '2026-10-22' }
    } as TitleItem
    const series = show([ep(1, 1, { watchCount: 1, lastWatchedAt: '2026-10-21' }), ep(1, 2)])

    expect(
      continueWatching([film, finished, series]).map((item) => [
        item.title.name,
        item.fileId,
        item.episode,
        item.progress?.position ?? null
      ])
    ).toEqual([
      ['Země gangů', 102, 'S01E02', null],
      ['Prázdnota', 5, null, 900]
    ])
  })

  it('k souboru najde název a stav pro dialog pokračování', () => {
    const series = show([ep(1, 2, { progress: progress(600, '2026-10-21') })])
    expect(watchForFile([series], 102)).toMatchObject({
      label: 'Země gangů · S01E02',
      watch: { progress: { position: 600 } }
    })
    expect(watchForFile([series], 999)).toBeNull()
  })
})
