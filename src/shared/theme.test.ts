import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_SETTINGS, parseThemeSettings } from './theme'

describe('parseThemeSettings', () => {
  it('bez uložené hodnoty platí výchozí (zapnuto, 25 %, stahovat automaticky)', () => {
    expect(parseThemeSettings(undefined)).toEqual(DEFAULT_THEME_SETTINGS)
    expect(DEFAULT_THEME_SETTINGS).toEqual({ enabled: true, volume: 25, autoDownload: true })
  })

  it('hlasitost zaokrouhlí a omezí na 0–100', () => {
    expect(parseThemeSettings({ enabled: false, volume: 33.6, autoDownload: false })).toEqual({
      enabled: false,
      volume: 34,
      autoDownload: false
    })
    expect(parseThemeSettings({ volume: 250 }).volume).toBe(100)
    expect(parseThemeSettings({ volume: -5 }).volume).toBe(0)
    expect(parseThemeSettings({ volume: 'hlasitě' }).volume).toBe(25)
  })
})
