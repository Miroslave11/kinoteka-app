import { describe, expect, it } from 'vitest'
import { pickBestMatch, toCandidates, type SearchCandidate } from './matching'

const c = (
  id: number,
  title: string,
  year: number | null,
  originalTitle: string | null = null,
  voteCount = 100
): SearchCandidate => ({
  id,
  title,
  originalTitle,
  year,
  voteCount
})

describe('pickBestMatch', () => {
  it('vybere přesný název se správným rokem', () => {
    const match = pickBestMatch(['Prázdnota'], 2020, [
      c(1, 'Prázdnota', 2003),
      c(2, 'Prázdnota', 2020, 'The Void'),
      c(3, 'Prázdné místo', 2020)
    ])
    expect(match?.id).toBe(2)
  })

  it('remake se rozliší rokem', () => {
    const candidates = [c(1, 'Duna', 1984, 'Dune', 3000), c(2, 'Duna', 2021, 'Dune', 12000)]
    expect(pickBestMatch(['Duna'], 1984, candidates)?.id).toBe(1)
    expect(pickBestMatch(['Duna'], 2021, candidates)?.id).toBe(2)
  })

  it('najde podle originálního nebo alternativního názvu', () => {
    const match = pickBestMatch(['Vidím Vás', 'The Watcher'], 2022, [
      c(1, 'Pozorovatel', 2022, 'The Watcher'),
      c(2, 'Watchmen', 2019)
    ])
    expect(match?.id).toBe(1)
  })

  it('přijme podnázev („Predátor - Nebezpečné Území“ vs. „Predátor: Nebezpečné území“)', () => {
    const match = pickBestMatch(['Predátor - Nebezpečné Území'], 2025, [
      c(1, 'Predátor: Nebezpečné území', 2025, 'Predator: Badlands'),
      c(2, 'Predátor', 1987)
    ])
    expect(match?.id).toBe(1)
  })

  it('nejistou shodu odmítne', () => {
    expect(
      pickBestMatch(['Úkryt nebo past'], 2026, [c(1, 'Past', 2019), c(2, 'Úkryt', 2010)])
    ).toBeNull()
    expect(pickBestMatch(['Cokoli'], null, [])).toBeNull()
  })
})

describe('toCandidates', () => {
  it('převede výsledky filmů i seriálů', () => {
    expect(
      toCandidates({
        results: [
          {
            id: 1,
            title: 'Film',
            original_title: 'Movie',
            release_date: '2020-05-01',
            vote_count: 5
          },
          { id: 2, name: 'Seriál', original_name: 'Show', first_air_date: '2022-10-13' },
          { id: 3, title: 'Bez data', release_date: '' }
        ]
      })
    ).toEqual([
      { id: 1, title: 'Film', originalTitle: 'Movie', year: 2020, voteCount: 5 },
      { id: 2, title: 'Seriál', originalTitle: 'Show', year: 2022, voteCount: 0 },
      { id: 3, title: 'Bez data', originalTitle: null, year: null, voteCount: 0 }
    ])
  })
})
