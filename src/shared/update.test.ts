import { describe, expect, it } from 'vitest'
import { keyExpiresSoon, keyWarning } from './update'

const now = new Date('2026-10-25T10:00:00Z')

describe('upozornění na klíč pro aktualizace', () => {
  it('klíč platný ještě déle než 30 dní je v pořádku', () => {
    const key = { status: 'ok' as const, expiresAt: '2027-10-25T08:00:00.000Z' }
    expect(keyExpiresSoon(key, now)).toBe(false)
    expect(keyWarning(key, now)).toBeNull()
  })

  it('30 dní před vypršením upozorní i s datem', () => {
    const key = { status: 'ok' as const, expiresAt: '2026-11-15T08:00:00.000Z' }
    expect(keyExpiresSoon(key, now)).toBe(true)
    expect(keyWarning(key, now)).toMatch(/vyprší 15\. ?11\. ?2026/)
  })

  it('neplatný klíč upozorní vždy, chybějící nebo neověřený ne', () => {
    expect(keyWarning({ status: 'invalid', expiresAt: null }, now)).toMatch(/neplatný/)
    expect(keyWarning({ status: 'none', expiresAt: null }, now)).toBeNull()
    expect(keyWarning({ status: 'unknown', expiresAt: null }, now)).toBeNull()
    expect(keyWarning({ status: 'ok', expiresAt: null }, now)).toBeNull()
  })
})
