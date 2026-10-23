import { describe, expect, it } from 'vitest'
import { countOf, plural } from './plural'

describe('plural', () => {
  it('1 / 2–4 / 0 a 5+', () => {
    expect([0, 1, 2, 4, 5, 11, 22].map((n) => plural(n, 'film', 'filmy', 'filmů'))).toEqual([
      'filmů',
      'film',
      'filmy',
      'filmy',
      'filmů',
      'filmů',
      'filmů'
    ])
  })

  it('počet se slovem a oddělením tisíců', () => {
    expect(countOf(1, 'soubor', 'soubory', 'souborů')).toBe('1 soubor')
    expect(countOf(1532, 'soubor', 'soubory', 'souborů')).toBe('1 532 souborů')
  })
})
