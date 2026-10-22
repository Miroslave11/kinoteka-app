import { describe, expect, it } from 'vitest'
import type { CatalogFile } from '../../../shared/catalog'
import { DEFAULT_FILTERS, filterOptions, filterTitles, type TitleItem } from './catalogData'

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
  files
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
    episodeCount: 0
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
