import { describe, expect, it } from 'vitest'
import { formatRelativeTime, formatSize, isNetworkPath, isVideoFile } from './library'

describe('isVideoFile', () => {
  it.each([
    ['Den odhalení (2026) CZ DABING.mkv', true],
    ['Země gangů_S01E02_Puzzle.mp4', true],
    ['FILM.MKV', true],
    ['titulky.srt', false],
    ['poster.jpg', false],
    ['.mkv', false],
    ['bez přípony', false]
  ])('%s → %s', (name, expected) => {
    expect(isVideoFile(name)).toBe(expected)
  })
})

describe('isNetworkPath', () => {
  it.each([
    ['\\\\DS920\\video\\Filmy', true],
    ['\\\\nas\\video', true],
    ['//nas/video', true],
    ['C:\\Mirek_data\\09_Videa', false],
    ['Z:\\Filmy', false],
    ['\\\\nas', false]
  ])('%s → %s', (path, expected) => {
    expect(isNetworkPath(path)).toBe(expected)
  })
})

describe('formatSize', () => {
  it.each([
    [0, '0 B'],
    [1536, '2 kB'],
    [4.1 * 1024 ** 3, '4,1 GB'],
    [150 * 1024 ** 3, '150 GB'],
    [2.5 * 1024 ** 4, '2,5 TB']
  ])('%s → %s', (bytes, expected) => {
    expect(formatSize(bytes).replace(/\s/g, ' ')).toBe(expected)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-22T20:00:00Z')

  it('nedávno → právě teď', () => {
    expect(formatRelativeTime('2026-10-22T19:59:40Z', now)).toBe('právě teď')
  })

  it('minuty a hodiny', () => {
    expect(formatRelativeTime('2026-10-22T19:55:00Z', now)).toBe('před 5 minutami')
    expect(formatRelativeTime('2026-10-22T17:00:00Z', now)).toBe('před 3 hodinami')
  })
})
