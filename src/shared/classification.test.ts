import { describe, expect, it } from 'vitest'
import { describeClassification, parseClassification } from './classification'

describe('parseClassification', () => {
  it('film i díl, ořezané texty', () => {
    expect(parseClassification({ kind: 'movie', title: '  Prázdnota ', year: 2020 })).toEqual({
      kind: 'movie',
      title: 'Prázdnota',
      year: 2020
    })
    expect(
      parseClassification({
        kind: 'episode',
        title: 'Země gangů',
        season: 1,
        episode: 2,
        episodeTitle: ''
      })
    ).toEqual({
      kind: 'episode',
      title: 'Země gangů',
      year: null,
      season: 1,
      episode: 2,
      episodeTitle: null
    })
  })

  it('odmítne neplatné', () => {
    expect(parseClassification({ kind: 'movie', title: '' })).toBeNull()
    expect(parseClassification({ kind: 'movie', title: 'X', year: 20 })).toBeNull()
    expect(parseClassification({ kind: 'episode', title: 'X', season: 1 })).toBeNull()
    expect(parseClassification({ kind: 'show', title: 'X' })).toBeNull()
  })
})

describe('describeClassification', () => {
  it('čitelný popis', () => {
    expect(describeClassification({ kind: 'movie', title: 'Prázdnota', year: 2020 })).toBe(
      'Film: Prázdnota (2020)'
    )
    expect(
      describeClassification({
        kind: 'episode',
        title: 'Země gangů',
        year: null,
        season: 1,
        episode: 2,
        episodeTitle: 'Puzzle'
      })
    ).toBe('Seriál Země gangů · S01E02 · Puzzle')
  })
})
