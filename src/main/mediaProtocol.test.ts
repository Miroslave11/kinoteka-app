import { describe, expect, it, vi } from 'vitest'

// Modul importuje Electron jen kvůli registraci protokolu – parseRange ho nepotřebuje.
vi.mock('electron', () => ({ protocol: {} }))
const { parseRange } = await import('./mediaProtocol')

describe('parseRange', () => {
  it.each([
    ['bytes=0-99', 1000, { start: 0, end: 99 }],
    ['bytes=500-', 1000, { start: 500, end: 999 }],
    ['bytes=-200', 1000, { start: 800, end: 999 }],
    ['bytes=900-5000', 1000, { start: 900, end: 999 }]
  ])('%s z %i B', (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected)
  })

  it.each([[null], ['bytes=-'], ['bytes=1000-'], ['bytes=50-10'], ['items=0-1']])(
    'neplatné %s → null',
    (header) => {
      expect(parseRange(header, 1000)).toBeNull()
    }
  )
})
