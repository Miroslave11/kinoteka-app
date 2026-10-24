import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  isValidPin,
  type KidsChallenge,
  type KidsMode,
  type KidsUnlockResult
} from '../../shared/kids'
import type { SettingsRepository } from '../settings/SettingsRepository'

const SETTING = {
  locked: 'kids.locked',
  pin: 'kids.pin',
  usage: 'kids.usage'
} as const

/** Jak dlouho zůstane část Pro rodiče otevřená bez dalšího zadání PINu. */
const PARENT_SESSION_MS = 15 * 60 * 1000
/** Po tolika špatných pokusech brána chvíli počká. */
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30 * 1000

interface StoredPin {
  salt: string
  hash: string
}

const hashPin = (pin: string, salt: string): Buffer => scryptSync(pin, Buffer.from(salt, 'hex'), 32)

/** Dnešek (místní čas) pro denní limit pohádek. */
function today(now: Date): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/**
 * Rodičovská brána dětského režimu: zamčený režim (přežije restart), PIN uložený jako
 * scrypt otisk, příklad pro dospělé, když PIN není, a denní čas pohádek.
 */
export class KidsGuard {
  private parentUntil = 0
  private failures = 0
  private blockedUntil = 0
  private mathAnswer: number | null = null

  constructor(
    private readonly settings: SettingsRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  get locked(): boolean {
    return this.settings.get<boolean>(SETTING.locked) ?? false
  }

  hasPin(): boolean {
    return this.settings.get<StoredPin>(SETTING.pin) !== undefined
  }

  /** Smí se měnit nastavení, stahovat a mazat? Mimo dětský režim ano, v něm jen za branou. */
  parentAccess(): boolean {
    return !this.locked || this.now().getTime() < this.parentUntil
  }

  mode(timeLimitMin: number | null): KidsMode {
    return {
      locked: this.locked,
      parent: this.locked && this.parentAccess(),
      hasPin: this.hasPin(),
      timeLeftSec: this.timeLeft(timeLimitMin)
    }
  }

  /** Vstup do dětského režimu – okno se zamkne, část Pro rodiče zavře. */
  enter(): void {
    this.settings.set(SETTING.locked, true)
    this.parentUntil = 0
  }

  /** Odchod z dětského režimu – za branou, nebo volně, když ho rodiče nechrání. */
  exit(gateRequired = true): boolean {
    if (gateRequired && !this.parentAccess()) return false
    this.settings.set(SETTING.locked, false)
    this.parentUntil = 0
    return true
  }

  /** Zpět k pohádkám – část Pro rodiče se zavře, režim zůstane zamčený. */
  leaveParent(): void {
    this.parentUntil = 0
  }

  challenge(): KidsChallenge {
    if (this.hasPin()) return { kind: 'pin' }
    // Násobilka nad 5 – předškolák ji nespočítá, dospělý hned.
    const a = randomInt(6, 10)
    const b = randomInt(6, 10)
    this.mathAnswer = a * b
    return { kind: 'math', question: `Kolik je ${a} × ${b}?` }
  }

  unlock(answer: unknown): KidsUnlockResult {
    const now = this.now().getTime()
    if (now < this.blockedUntil) {
      return {
        ok: false,
        message: 'Moc pokusů. Zkus to za chvíli.',
        retryAfterSec: Math.ceil((this.blockedUntil - now) / 1000)
      }
    }
    if (typeof answer !== 'string' || !this.check(answer.trim())) {
      this.failures++
      if (this.failures >= MAX_ATTEMPTS) {
        this.failures = 0
        this.blockedUntil = now + LOCKOUT_MS
        return {
          ok: false,
          message: 'Moc pokusů. Zkus to za chvíli.',
          retryAfterSec: LOCKOUT_MS / 1000
        }
      }
      return { ok: false, message: this.hasPin() ? 'Špatný PIN.' : 'To není správně.' }
    }
    this.failures = 0
    this.mathAnswer = null
    this.parentUntil = now + PARENT_SESSION_MS
    return { ok: true }
  }

  private check(answer: string): boolean {
    const stored = this.settings.get<StoredPin>(SETTING.pin)
    if (stored) {
      if (!isValidPin(answer)) return false
      const expected = Buffer.from(stored.hash, 'hex')
      const actual = hashPin(answer, stored.salt)
      return expected.length === actual.length && timingSafeEqual(expected, actual)
    }
    return this.mathAnswer !== null && answer === String(this.mathAnswer)
  }

  /** Nový PIN, nebo null = zrušit (pak brána ukazuje příklad). Jen za branou. */
  setPin(pin: string | null): boolean {
    if (!this.parentAccess()) return false
    if (pin === null) {
      this.settings.delete(SETTING.pin)
      return true
    }
    if (!isValidPin(pin)) return false
    const salt = randomBytes(16).toString('hex')
    this.settings.set(SETTING.pin, { salt, hash: hashPin(pin, salt).toString('hex') })
    return true
  }

  // ---------- denní čas pohádek ----------

  private usedToday(): number {
    const usage = this.settings.get<{ date: string; seconds: number }>(SETTING.usage)
    return usage && usage.date === today(this.now()) ? usage.seconds : 0
  }

  /** Přičte sledování (sekundy). */
  addPlayTime(seconds: number): void {
    if (!(seconds > 0)) return
    this.settings.set(SETTING.usage, {
      date: today(this.now()),
      seconds: this.usedToday() + seconds
    })
  }

  timeLeft(limitMin: number | null): number | null {
    if (limitMin === null) return null
    return Math.max(0, Math.round(limitMin * 60 - this.usedToday()))
  }

  /** Rodič dnešní čas vynuluje (pohádky zase můžou). */
  resetPlayTime(): boolean {
    if (!this.parentAccess()) return false
    this.settings.delete(SETTING.usage)
    return true
  }
}
