import {
  HA_PAUSE_DELAY_MS,
  type HaActionResult,
  type HaAutomationSettings,
  type HaPlaybackKind,
  type HaRuleAction
} from '../../shared/ha'

/** Co automatika potřebuje od spojení s Home Assistant (HaService). */
export interface HaAutomationTarget {
  automation(): HaAutomationSettings
  /** Je Home Assistant zapnutý a entita vybraná? */
  configured(): boolean
  /** Poslední známý stav entity (on / off / unavailable…); null = neznámý. */
  entityState(): string | null
  setOn(on: boolean): Promise<HaActionResult>
}

export interface HaPlaybackFlags {
  paused: boolean
  /** mpv došel na konec souboru. */
  ended: boolean
  /** Následuje další díl / video (konec dílu není konec sledování). */
  hasNext: boolean
}

type Phase = 'playing' | 'paused' | 'ended' | 'closed'

/**
 * Automatika podle přehrávání (SCOPE-HA.md): spuštění, pauza delší než 2 s, pokračování
 * a konec přepínají entitu podle pravidel. Na konci se umí vrátit stav před spuštěním –
 * ale jen když entitu mezitím nikdo nepřepnul ručně.
 */
export class HaAutomation {
  private current: HaPlaybackRun | null = null

  constructor(
    private readonly target: HaAutomationTarget,
    private readonly pauseDelayMs = HA_PAUSE_DELAY_MS
  ) {}

  /**
   * Nové přehrávání. Když ještě běží předchozí (přímý přechod na jiný film), nové převezme
   * jeho původní stav, aby „vrátit původní“ na konci vrátilo stav před prvním filmem.
   */
  begin(kind: HaPlaybackKind, onFailure?: (message: string) => void): HaPlaybackRun {
    const previous = this.current
    const run = new HaPlaybackRun(
      this.target,
      this.pauseDelayMs,
      previous?.isOpen ? previous.handOver() : null,
      onFailure
    )
    this.current = run
    run.start(kind)
    return run
  }

  private lastSeen: string | null = null

  /**
   * Stav entity z Home Assistant (i ruční změna – vypínač na zdi, klávesa L). Volá se při
   * každé změně stavu spojení; zpracuje se jen skutečná změna stavu entity.
   */
  entityChanged(state: string | null): void {
    if (state === this.lastSeen) return
    this.lastSeen = state
    this.current?.entityChanged(state)
  }
}

interface Inherited {
  original: string | null
  override: boolean
}

export class HaPlaybackRun {
  private phase: Phase = 'playing'
  private active = false
  private original: string | null = null
  private override = false
  /** Stav, který automatika naposledy nastavila (změna na jiný = ruční zásah). */
  private expected: string | null = null
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private failed = false

  constructor(
    private readonly target: HaAutomationTarget,
    private readonly pauseDelayMs: number,
    private readonly inherited: Inherited | null,
    private readonly onFailure?: (message: string) => void
  ) {}

  get isOpen(): boolean {
    return this.phase !== 'closed'
  }

  start(kind: HaPlaybackKind): void {
    const rules = this.target.automation()
    this.active = this.target.configured() && rules.enabled && rules.sections[kind]
    this.original = this.inherited ? this.inherited.original : this.target.entityState()
    this.override = this.inherited?.override ?? false
    this.expected = this.target.entityState()
    if (this.active) this.apply(rules.start)
  }

  /** Předá původní stav novému přehrávání a samo skončí bez akce. */
  handOver(): Inherited {
    this.clearPause()
    this.phase = 'closed'
    return { original: this.original, override: this.override }
  }

  flags({ paused, ended, hasNext }: HaPlaybackFlags): void {
    if (!this.active || this.phase === 'closed') return
    const rules = (): HaAutomationSettings => this.target.automation()
    if (ended) {
      this.clearPause()
      // Konec dílu s dalším dílem = přechod, ne konec sledování.
      if (hasNext || this.phase === 'ended') return
      this.phase = 'ended'
      this.apply(rules().end)
      return
    }
    if (paused) {
      if (this.phase !== 'playing' || this.pauseTimer) return
      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = null
        if (this.phase !== 'playing') return
        this.phase = 'paused'
        this.apply(rules().pause)
      }, this.pauseDelayMs)
      return
    }
    // Hraje.
    this.clearPause()
    if (this.phase === 'paused') this.apply(rules().resume)
    else if (this.phase === 'ended') this.apply(rules().start) // Přehrát znovu
    this.phase = 'playing'
  }

  /** Přehrávač se zavřel (konec, Zpět, Zastavit, křížek). */
  end(): void {
    if (this.phase === 'closed') return
    this.clearPause()
    const wasEnded = this.phase === 'ended'
    this.phase = 'closed'
    if (this.active && !wasEnded) this.apply(this.target.automation().end)
  }

  entityChanged(state: string | null): void {
    if (this.phase === 'closed' || (state !== 'on' && state !== 'off')) return
    if (state !== this.expected) this.override = true
    this.expected = state
  }

  private clearPause(): void {
    if (this.pauseTimer) clearTimeout(this.pauseTimer)
    this.pauseTimer = null
  }

  private apply(action: HaRuleAction): void {
    if (action === 'none') return
    if (action === 'restore') {
      if (this.override || (this.original !== 'on' && this.original !== 'off')) return
      return this.set(this.original === 'on')
    }
    this.set(action === 'on')
  }

  private set(on: boolean): void {
    const wanted = on ? 'on' : 'off'
    this.expected = wanted
    if (this.target.entityState() === wanted) return
    void this.target.setOn(on).then((result) => {
      if (result.ok || this.failed) return
      // Hláška jen jednou za přehrávání; film hraje dál.
      this.failed = true
      this.onFailure?.(`Home Assistant: ${result.message ?? 'příkaz se nepovedl.'}`)
    })
  }
}
