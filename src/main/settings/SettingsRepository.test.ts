import { describe, expect, it } from 'vitest'
import { parseTmdbUrl } from '../../shared/metadata'
import { openDatabase } from '../db/database'
import { SettingsRepository, type SecretCipher } from './SettingsRepository'

/** Testovací „šifra“ – obrací text, aby bylo poznat, že se hodnota neuloží v čitelné podobě. */
const reverseCipher: SecretCipher = {
  available: () => true,
  encrypt: (plain) => Buffer.from([...plain].reverse().join(''), 'utf8'),
  decrypt: (data) => [...data.toString('utf8')].reverse().join('')
}

describe('SettingsRepository', () => {
  it('ukládá a čte hodnoty, přepisuje existující', () => {
    const settings = new SettingsRepository(openDatabase(':memory:'))
    expect(settings.get('x')).toBeUndefined()
    settings.set('x', { a: 1 })
    settings.set('x', { a: 2 })
    expect(settings.get('x')).toEqual({ a: 2 })
    settings.delete('x')
    expect(settings.get('x')).toBeUndefined()
  })

  it('tajnou hodnotu uloží šifrovaně a vrátí v původní podobě', () => {
    const db = openDatabase(':memory:')
    const settings = new SettingsRepository(db, reverseCipher)
    settings.setSecret('tmdb.key', 'abc123')
    const raw = db.prepare("SELECT value FROM settings WHERE key = 'tmdb.key'").get()
    expect(String(raw?.['value'])).not.toContain('abc123')
    expect(settings.getSecret('tmdb.key')).toBe('abc123')
  })

  it('bez dostupného šifrování nevrátí šifrovanou hodnotu', () => {
    const db = openDatabase(':memory:')
    new SettingsRepository(db, reverseCipher).setSecret('k', 'tajne')
    const withoutCipher = new SettingsRepository(db, { ...reverseCipher, available: () => false })
    expect(withoutCipher.getSecret('k')).toBeUndefined()
  })
})

describe('parseTmdbUrl', () => {
  it('pozná odkaz na film i seriál', () => {
    expect(parseTmdbUrl('https://www.themoviedb.org/movie/27205-inception?language=cs')).toEqual({
      kind: 'movie',
      tmdbId: 27205
    })
    expect(parseTmdbUrl('themoviedb.org/tv/1396-breaking-bad')).toEqual({
      kind: 'show',
      tmdbId: 1396
    })
    expect(parseTmdbUrl('https://www.csfd.cz/film/123')).toBeNull()
  })
})
