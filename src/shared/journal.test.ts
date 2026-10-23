import { describe, expect, it } from 'vitest'
import {
  entryLabel,
  filterJournal,
  groupByMonth,
  journalStats,
  parseEntryUpdate,
  parseManualEntry,
  type JournalEntry
} from './journal'

const entry = (overrides: Partial<JournalEntry>): JournalEntry => ({
  id: 1,
  titleId: 1,
  kind: 'movie',
  titleName: 'Prázdnota',
  year: 2020,
  posterUrl: null,
  episode: null,
  watchedAt: '2026-10-12T20:40:00.000Z',
  source: 'auto',
  note: null,
  rating: null,
  ordinal: 1,
  runtimeMin: 100,
  inLibrary: true,
  ...overrides
})

const ENTRIES = [
  entry({ id: 1, titleId: 1, rating: 4, watchedAt: '2026-10-12T20:00:00.000Z' }),
  entry({ id: 2, titleId: 1, rating: 4, ordinal: 2, watchedAt: '2026-10-20T20:00:00.000Z' }),
  entry({
    id: 3,
    titleId: 2,
    kind: 'show',
    titleName: 'Země gangů',
    episode: { id: 9, season: 1, episode: 2, name: 'Puzzle' },
    rating: 2,
    runtimeMin: 50,
    watchedAt: '2026-09-30T19:00:00.000Z'
  }),
  entry({ id: 4, titleId: 3, runtimeMin: null, watchedAt: '2025-12-31T21:00:00.000Z' })
]

describe('journalStats', () => {
  it('letošní filmy a díly, průměr hodnocení přes tituly, celkový čas', () => {
    expect(journalStats(ENTRIES, new Date('2026-10-23T12:00:00Z'))).toEqual({
      moviesThisYear: 2,
      episodesThisYear: 1,
      averageRating: 3,
      totalHours: 4
    })
  })

  it('prázdný deník', () => {
    expect(journalStats([])).toEqual({
      moviesThisYear: 0,
      episodesThisYear: 0,
      averageRating: null,
      totalHours: 0
    })
  })
})

describe('filterJournal', () => {
  it('druh a hodnocení', () => {
    expect(filterJournal(ENTRIES, 'show', 'all').map((e) => e.id)).toEqual([3])
    expect(filterJournal(ENTRIES, 'all', 4).map((e) => e.id)).toEqual([1, 2])
    expect(filterJournal(ENTRIES, 'movie', 'none').map((e) => e.id)).toEqual([4])
  })
})

describe('groupByMonth', () => {
  it('nejnovější měsíc první', () => {
    expect(groupByMonth(ENTRIES).map((g) => [g.month, g.entries.map((e) => e.id)])).toEqual([
      ['říjen 2026', [2, 1]],
      ['září 2026', [3]],
      ['prosinec 2025', [4]]
    ])
  })
})

describe('entryLabel', () => {
  it('díl i film', () => {
    expect(entryLabel(ENTRIES[2]!)).toBe('Země gangů · S01E02 · Puzzle')
    expect(entryLabel(ENTRIES[0]!)).toBe('Prázdnota')
  })
})

describe('parsování požadavků z okna', () => {
  it('ruční záznam', () => {
    expect(
      parseManualEntry({
        titleId: 3,
        episodeIds: [4, 5],
        watchedAt: '2026-10-21T20:00',
        note: '  super '
      })
    ).toMatchObject({ titleId: 3, episodeIds: [4, 5], note: 'super' })
    expect(parseManualEntry({ titleId: 3, watchedAt: 'včera' })).toBeNull()
    expect(parseManualEntry({ titleId: 3, episodeIds: ['x'], watchedAt: '2026-10-21' })).toBeNull()
  })

  it('úprava záznamu', () => {
    expect(parseEntryUpdate({ note: '' })).toEqual({ note: null })
    expect(parseEntryUpdate({ watchedAt: 'nesmysl' })).toBeNull()
  })
})
