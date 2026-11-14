import {
  HA_PAUSE_DELAY_MS,
  HA_START_DELAY_MS,
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
    private readonly pauseDelayMs = HA_PAUSE_DELAY_MS,
    private readonly startDelayMs = HA_START_DELAY_MS
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
      this.startDelayMs,
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
  /** Předchozí přehrávání už entitu přepnulo (na konci je co vracet). */
  touched: boolean
}

export class HaPlaybackRun {
  private phase: Phase = 'playing'
  private active = false
  private original: string | null = null
  private override = false
  /** Stav, který automatika naposledy nastavila (změna na jiný = ruční zásah). */
  private expected: string | null = null
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  /** Akce „spuštění“ čeká, až video chvíli hraje. */
  private startTimer: ReturnType<typeof setTimeout> | null = null
  private startDone = false
  /** Automatika už v tomto (nebo předchozím) přehrávání něco přepnula. */
  private touched = false
  private paused = false
  private failed = false

  constructor(
    private readonly target: HaAutomationTarget,
    private readonly pauseDelayMs: number,
    private readonly startDelayMs: number,
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
    this.touched = this.inherited?.touched ?? false
    this.expected = this.target.entityState()
  }

  /**
   * Video se rozehrálo (mpv hlásí pozici). Akce „spuštění“ proběhne po {@link HA_START_DELAY_MS},
   * pokud video mezitím nikdo nepozastavil ani nezavřel.
   */
  progress(): void {
    if (!this.active || this.startDone || this.startTimer || this.paused) return
    if (this.phase !== 'playing') return
    this.startTimer = setTimeout(() => {
      this.startTimer = null
      if (this.phase !== 'playing' || this.paused) return
      this.startDone = true
      this.apply(this.target.automation().start)
    }, this.startDelayMs)
  }

  /** Předá původní stav novému přehrávání a samo skončí bez akce. */
  handOver(): Inherited {
    this.clearPause()
    this.clearStart()
    this.phase = 'closed'
    return { original: this.original, override: this.override, touched: this.touched }
  }

  flags({ paused, ended, hasNext }: HaPlaybackFlags): void {
    if (!this.active || this.phase === 'closed') return
    this.paused = paused
    const rules = (): HaAutomationSettings => this.target.automation()
    if (ended) {
      this.clearPause()
      // Konec dílu s dalším dílem = přechod, ne konec sledování.
      if (hasNext || this.phase === 'ended') return
      this.clearStart()
      this.phase = 'ended'
      // Před spuštěním se nic nepřepnulo – není co vracet.
      if (this.touched) this.apply(rules().end)
      return
    }
    if (paused) {
      // Pauza dřív, než akce „spuštění“ proběhla: počká se na nové rozehrání.
      this.clearStart()
      if (!this.touched) return
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
    // Přehrát znovu po konci: „spuštění“ znovu se zpožděním.
    else if (this.phase === 'ended') this.startDone = false
    this.phase = 'playing'
    this.progress()
  }

  /** Přehrávač se zavřel (konec, Zpět, Zastavit, křížek). */
  end(): void {
    if (this.phase === 'closed') return
    this.clearPause()
    this.clearStart()
    const wasEnded = this.phase === 'ended'
    this.phase = 'closed'
    // Zavřeno dřív, než se cokoli přepnulo: entita zůstane, jak byla.
    if (this.active && !wasEnded && this.touched) this.apply(this.target.automation().end)
  }

  entityChanged(state: string | null): void {
    if (this.phase === 'closed' || (state !== 'on' && state !== 'off')) return
    if (state !== this.expected) this.override = true
    this.expected = state
  }

  private clearStart(): void {
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
  }

  private clearPause(): void {
    if (this.pauseTimer) clearTimeout(this.pauseTimer)
    this.pauseTimer = null
  }

  private apply(action: HaRuleAction): void {
    if (action === 'none') return
    if (action !== 'restore') this.touched = true
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
