import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HA_AUTOMATION,
  DEFAULT_HA_SETTINGS,
  haBulbState,
  haLabel,
  isToggleEntityId,
  normalizeHaUrl,
  parseHaAutomation,
  parseHaSettings,
  type HaStatus
} from './ha'

const status = (patch: Partial<HaStatus> = {}): HaStatus => ({
  settings: { ...DEFAULT_HA_SETTINGS, enabled: true, entityId: 'switch.vypinac_linka' },
  automation: DEFAULT_HA_AUTOMATION,
  hasToken: true,
  connection: 'connected',
  error: null,
  haVersion: '2026.11.0',
  locationName: 'Domov',
  entity: { entityId: 'switch.vypinac_linka', state: 'on', friendlyName: 'vypinac_linka' },
  ...patch
})

describe('normalizeHaUrl', () => {
  it('doplní http a odstraní cestu', () => {
    expect(normalizeHaUrl('homeassistant.local:8123')).toBe('http://homeassistant.local:8123')
    expect(normalizeHaUrl(' http://192.168.0.127:8123/lovelace/0 ')).toBe(
      'http://192.168.0.127:8123'
    )
    expect(normalizeHaUrl('https://dum.example.cz/')).toBe('https://dum.example.cz')
  })

  it('odmítne nesmysly', () => {
    expect(normalizeHaUrl('')).toBeNull()
    expect(normalizeHaUrl('ftp://dum')).toBeNull()
    expect(normalizeHaUrl(42)).toBeNull()
  })
})

describe('isToggleEntityId', () => {
  it('přijme jen přepínatelné domény', () => {
    expect(isToggleEntityId('switch.vypinac_linka')).toBe(true)
    expect(isToggleEntityId('light.led_loznice')).toBe(true)
    expect(isToggleEntityId('sensor.teplota')).toBe(false)
    expect(isToggleEntityId('switch')).toBe(false)
  })
})

describe('parseHaSettings', () => {
  it('neplatné hodnoty nahradí výchozími', () => {
    expect(parseHaSettings({ enabled: 'ano', url: 'ftp://x', entityId: 'sensor.t' })).toEqual(
      DEFAULT_HA_SETTINGS
    )
  })
})

describe('žárovka', () => {
  it('stav podle spojení a entity', () => {
    expect(haBulbState(null)).toBe('hidden')
    expect(haBulbState(status())).toBe('on')
    expect(haBulbState(status({ entity: { ...status().entity!, state: 'off' } }))).toBe('off')
    expect(haBulbState(status({ connection: 'error' }))).toBe('unavailable')
    expect(haBulbState(status({ settings: { ...status().settings, enabled: false } }))).toBe(
      'hidden'
    )
  })

  it('název: vlastní, jinak z Home Assistant', () => {
    expect(haLabel(status())).toBe('vypinac_linka')
    expect(haLabel(status({ settings: { ...status().settings, label: 'Linka' } }))).toBe('Linka')
  })
})

describe('parseHaAutomation', () => {
  it('výchozí pravidla podle návrhu', () => {
    expect(parseHaAutomation(undefined)).toEqual(DEFAULT_HA_AUTOMATION)
    expect(DEFAULT_HA_AUTOMATION).toMatchObject({
      start: 'off',
      pause: 'on',
      resume: 'off',
      end: 'restore'
    })
  })

  it('přijme platné a zahodí neplatné hodnoty', () => {
    expect(
      parseHaAutomation({
        enabled: false,
        sections: { yt: false, movie: 'x' },
        start: 'restore',
        pause: 'none',
        end: 'off'
      })
    ).toEqual({
      enabled: false,
      sections: { movie: true, series: true, yt: false },
      start: 'off',
      pause: 'none',
      resume: 'off',
      end: 'off'
    })
  })
})
