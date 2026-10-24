import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import { KIDS_SETTINGS_KEY, KidsGuard } from './KidsGuard'

let settings: SettingsRepository
let now: Date
let guard: KidsGuard

beforeEach(() => {
  settings = new SettingsRepository(openDatabase(':memory:'))
  now = new Date('2026-10-24T10:00:00')
  guard = new KidsGuard(settings, () => now)
})

/** Odpověď na příklad z otázky „Kolik je 7 × 8?“. */
const solve = (question: string): string => {
  const [a, b] = question.match(/\d+/g)!.map(Number)
  return String(a! * b!)
}

describe('KidsGuard', () => {
  it('dětský režim přežije restart; bez brány ven nejde', () => {
    expect(guard.locked).toBe(false)
    expect(guard.parentAccess()).toBe(true)
    guard.enter()
    expect(new KidsGuard(settings, () => now).locked).toBe(true)
    expect(guard.parentAccess()).toBe(false)
    expect(guard.exit()).toBe(false)
    expect(guard.setPin('1234')).toBe(false)
  })

  it('vypnutá brána: Pro rodiče, změny i odchod bez PINu; po zapnutí zůstane otevřeno', () => {
    guard.setPin('2580')
    settings.set(KIDS_SETTINGS_KEY, { parentGate: false })
    guard.enter()
    expect(guard.parentAccess()).toBe(true)
    expect(guard.mode(null)).toMatchObject({ locked: true, parent: true })
    expect(guard.resetPlayTime()).toBe(true)
    settings.set(KIDS_SETTINGS_KEY, { parentGate: true })
    expect(guard.parentAccess()).toBe(false)
    guard.keepParentOpen()
    expect(guard.parentAccess()).toBe(true)
    settings.set(KIDS_SETTINGS_KEY, { parentGate: false })
    expect(guard.exit()).toBe(true)
  })

  it('nechráněný odchod jde i bez brány', () => {
    guard.enter()
    expect(guard.exit(false)).toBe(true)
    expect(guard.locked).toBe(false)
  })

  it('bez PINu příklad pro dospělé; správná odpověď otevře část Pro rodiče', () => {
    guard.enter()
    const challenge = guard.challenge()
    expect(challenge).toMatchObject({
      kind: 'math',
      question: expect.stringMatching(/^Kolik je \d × \d\?$/)
    })
    expect(guard.unlock('1')).toEqual({ ok: false, message: 'To není správně.' })
    expect(guard.unlock(solve((challenge as { question: string }).question))).toEqual({ ok: true })
    expect(guard.mode(null)).toMatchObject({ locked: true, parent: true, hasPin: false })
    expect(guard.exit()).toBe(true)
    expect(guard.locked).toBe(false)
  })

  it('PIN se ukládá jen jako otisk a ověřuje; část Pro rodiče se po 15 min zavře', () => {
    expect(guard.setPin('12a4')).toBe(false)
    expect(guard.setPin('2580')).toBe(true)
    expect(JSON.stringify(settings.get('kids.pin'))).not.toContain('2580')
    guard.enter()
    expect(guard.challenge()).toEqual({ kind: 'pin' })
    expect(guard.unlock('0000')).toMatchObject({ ok: false, message: 'Špatný PIN.' })
    expect(guard.unlock('2580')).toEqual({ ok: true })
    expect(guard.parentAccess()).toBe(true)
    now = new Date(now.getTime() + 16 * 60 * 1000)
    expect(guard.parentAccess()).toBe(false)
    guard.unlock('2580')
    guard.leaveParent()
    expect(guard.parentAccess()).toBe(false)
  })

  it('po pěti špatných pokusech chvíli čeká', () => {
    guard.setPin('2580')
    guard.enter()
    for (let i = 0; i < 4; i++) guard.unlock('0000')
    expect(guard.unlock('0000')).toMatchObject({ ok: false, retryAfterSec: 30 })
    expect(guard.unlock('2580')).toMatchObject({ ok: false, retryAfterSec: 30 })
    now = new Date(now.getTime() + 31_000)
    expect(guard.unlock('2580')).toEqual({ ok: true })
  })

  it('denní čas pohádek: odečítá se, další den začne znovu, rodič ho vynuluje', () => {
    expect(guard.timeLeft(null)).toBeNull()
    guard.addPlayTime(600)
    guard.addPlayTime(300)
    expect(guard.timeLeft(30)).toBe(900)
    guard.addPlayTime(2000)
    expect(guard.timeLeft(30)).toBe(0)
    now = new Date('2026-10-25T08:00:00')
    expect(guard.timeLeft(30)).toBe(1800)
    guard.addPlayTime(1800)
    expect(guard.resetPlayTime()).toBe(true)
    expect(guard.timeLeft(30)).toBe(1800)
  })
})
