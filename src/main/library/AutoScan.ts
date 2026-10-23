import type { SettingsRepository } from '../settings/SettingsRepository'

const SETTING = 'library.autoScan'
/** Interval automatického skenu. */
export const AUTO_SCAN_INTERVAL_MS = 30 * 60 * 1000
/** Po startu chvíli počkat, ať se aplikace nejdřív otevře. */
const START_DELAY_MS = 5000

/**
 * Automatický sken všech složek při startu a pak každých 30 minut (vypnutelný v Nastavení).
 * Nové a smazané soubory se tak projeví bez ručního „Skenovat vše“.
 */
export class AutoScan {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly settings: SettingsRepository,
    private readonly scanAll: () => Promise<unknown>,
    private readonly timers: {
      setTimeout: typeof setTimeout
      setInterval: typeof setInterval
      clearInterval: typeof clearInterval
    } = { setTimeout, setInterval, clearInterval }
  ) {}

  enabled(): boolean {
    return this.settings.get<boolean>(SETTING) ?? true
  }

  start(): void {
    if (!this.enabled()) return
    this.timers.setTimeout(() => void this.run(), START_DELAY_MS)
    this.schedule()
  }

  setEnabled(enabled: boolean): void {
    this.settings.set(SETTING, enabled)
    this.stop()
    if (enabled) this.schedule()
  }

  stop(): void {
    if (this.timer) this.timers.clearInterval(this.timer)
    this.timer = null
  }

  private schedule(): void {
    this.timer = this.timers.setInterval(() => void this.run(), AUTO_SCAN_INTERVAL_MS)
  }

  private async run(): Promise<void> {
    if (!this.enabled()) return
    // Chyba jedné složky (offline NAS) se zapíše do jejího stavu, sken pokračuje příště.
    await this.scanAll().catch(() => undefined)
  }
}
