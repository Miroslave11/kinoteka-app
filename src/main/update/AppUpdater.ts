import { EventEmitter } from 'node:events'
import type { UpdateState } from '../../shared/update'
import type { SettingsRepository } from '../settings/SettingsRepository'

const SETTING = 'update.autoCheck'
/** Jak často hledat novou verzi, když aplikace běží dlouho. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Po startu chvíli počkat, ať se aplikace nejdřív otevře. */
export const UPDATE_START_DELAY_MS = 15_000

/** Část `autoUpdater` z electron-updater, kterou Kinotéka používá (v testech napodobenina). */
export interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  /** Při nalezené verzi vrací i stahování (autoDownload), které může skončit chybou. */
  checkForUpdates(): Promise<{ downloadPromise?: Promise<unknown> | null } | null>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown
  on(event: 'update-not-available', listener: () => void): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

interface AppUpdaterEvents {
  changed: [UpdateState]
}

/** Srozumitelná chyba z electron-updater (bez internetu, zatím žádné vydání, …). */
export function updateErrorMessage(error: Error): string {
  const text = error.message
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|ETIMEDOUT|ECONNRESET|ERR_NAME_NOT_RESOLVED/i.test(text))
    return 'Aktualizace nejde zkontrolovat – zkontroluj připojení k internetu.'
  if (/latest\.yml|404|No published versions|Unable to find latest version/i.test(text))
    return 'Zatím není zveřejněná žádná verze ke stažení.'
  if (/sha512 checksum mismatch/i.test(text))
    return 'Stažená aktualizace je poškozená – zkusí se to znovu příště.'
  return `Aktualizace se nepovedla: ${text.split('\n')[0]}`
}

/**
 * Automatické aktualizace: chvíli po startu a pak každých 6 hodin se zeptá na novou verzi
 * (veřejný repozitář Miroslave11/kinoteka-app), stáhne ji na pozadí a nainstaluje při
 * zavření aplikace – nebo hned po kliknutí na „Restartovat a nainstalovat“.
 */
export class AppUpdater extends EventEmitter<AppUpdaterEvents> {
  private timer: NodeJS.Timeout | null = null
  private current: Omit<UpdateState, 'autoCheck'>

  constructor(
    private readonly settings: SettingsRepository,
    /** null = vývojová verze, aktualizace se nehledají. */
    private readonly updater: Updater | null,
    private readonly timers: {
      setTimeout: typeof setTimeout
      setInterval: typeof setInterval
      clearInterval: typeof clearInterval
    } = { setTimeout, setInterval, clearInterval }
  ) {
    super()
    this.current = {
      status: updater ? 'idle' : 'unsupported',
      version: null,
      percent: null,
      message: null
    }
    if (!updater) return
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.on('checking-for-update', () => this.set({ status: 'checking', message: null }))
    updater.on('update-available', (info) =>
      this.set({ status: 'downloading', version: info.version, percent: 0 })
    )
    updater.on('update-not-available', () =>
      this.set({ status: 'latest', version: null, percent: null })
    )
    updater.on('download-progress', (progress) =>
      this.set({ status: 'downloading', percent: Math.round(progress.percent) })
    )
    updater.on('update-downloaded', (info) =>
      this.set({ status: 'ready', version: info.version, percent: null })
    )
    updater.on('error', (error) => {
      // Připravená verze zůstane připravená – chyba další kontroly ji nesmaže.
      if (this.current.status === 'ready') return
      this.set({ status: 'error', percent: null, message: updateErrorMessage(error) })
    })
  }

  autoCheck(): boolean {
    return this.settings.get<boolean>(SETTING) ?? true
  }

  state(): UpdateState {
    return { ...this.current, autoCheck: this.autoCheck() }
  }

  start(): void {
    if (!this.updater || !this.autoCheck()) return
    this.timers.setTimeout(() => void this.run(), UPDATE_START_DELAY_MS)
    this.schedule()
  }

  setAutoCheck(enabled: boolean): void {
    this.settings.set(SETTING, enabled)
    this.stop()
    if (enabled && this.updater) this.schedule()
    this.emit('changed', this.state())
  }

  stop(): void {
    if (this.timer) this.timers.clearInterval(this.timer)
    this.timer = null
  }

  /** Zkontroluje novou verzi hned (tlačítko v Nastavení). */
  async check(): Promise<UpdateState> {
    const busy = ['checking', 'downloading', 'ready'].includes(this.current.status)
    if (this.updater && !busy) {
      // Chybu kontroly i stahování ohlásí událost „error“ – tady se jen nesmí propadnout dál.
      const result = await this.updater.checkForUpdates().catch(() => null)
      result?.downloadPromise?.catch(() => undefined)
    }
    return this.state()
  }

  /** Ukončí Kinotéku, nainstaluje připravenou verzi (bez průvodce) a znovu ji spustí. */
  installNow(): boolean {
    if (!this.updater || this.current.status !== 'ready') return false
    this.updater.quitAndInstall(true, true)
    return true
  }

  private async run(): Promise<void> {
    if (this.autoCheck()) await this.check()
  }

  private schedule(): void {
    this.timer = this.timers.setInterval(() => void this.run(), UPDATE_CHECK_INTERVAL_MS)
  }

  private set(patch: Partial<Omit<UpdateState, 'autoCheck'>>): void {
    this.current = { ...this.current, ...patch }
    this.emit('changed', this.state())
  }
}
