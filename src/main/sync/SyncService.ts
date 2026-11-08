import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { hostname } from 'node:os'
import type { SyncDevice, SyncStatus } from '../../shared/sync'
import { transaction, type Database } from '../db/database'
import type { SettingsRepository } from '../settings/SettingsRepository'
import { DriveClient, DriveError, type DriveEndpoints } from './driveClient'
import {
  refreshTokens,
  revoke,
  signIn,
  type GoogleClient,
  type GoogleEndpoints,
  type GoogleTokens
} from './googleAuth'
import {
  merge,
  parseDeviceFile,
  SyncRepository,
  type DeviceFile,
  type SyncAdapter
} from './syncModel'

const TOKENS_KEY = 'sync.google'
const DEVICE_ID_KEY = 'sync.deviceId'
const DEVICE_NAME_KEY = 'sync.deviceName'
const FILE_ID_KEY = 'sync.fileId'
const LAST_SYNC_KEY = 'sync.lastSyncAt'
const DEVICES_KEY = 'sync.devices'

const FILE_PREFIX = 'zarizeni-'
/** Pravidelná synchronizace. */
export const SYNC_INTERVAL_MS = 5 * 60_000
/** Po místní změně (deník…) se synchronizuje s krátkým zpožděním – víc změn najednou. */
export const SYNC_DELAY_MS = 10_000

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface SyncServiceOptions {
  db: Database
  settings: SettingsRepository
  adapters: readonly SyncAdapter[]
  /** Klíč aplikace u Googlu; null = tato verze sdílení neumí. */
  client: GoogleClient | null
  endpoints: GoogleEndpoints
  drive: DriveEndpoints
  fetch: FetchLike
  /** Otevře přihlášení Googlu (prohlížeč uživatele). */
  openUrl: (url: string) => Promise<void>
  /** Z jiného počítače přišly změny (obnovit deník, knihovnu…). */
  onApplied: () => void
  now?: () => Date
}

/** Sdílení přes Google Disk: přihlášení, plánování synchronizace a její stav. */
export class SyncService extends EventEmitter<{ changed: [] }> {
  private readonly repository: SyncRepository
  private running: Promise<void> | null = null
  /** Zvyšuje se odhlášením – synchronizace z doby před ním už nic nezapíše. */
  private session = 0
  private again = false
  private lastError: string | null = null
  private timer: NodeJS.Timeout | null = null
  private interval: NodeJS.Timeout | null = null
  /** Stažené soubory ostatních počítačů (ID → čas změny a obsah) – nestahovat znovu. */
  private readonly downloaded = new Map<string, { modifiedTime: string; file: DeviceFile }>()

  constructor(private readonly options: SyncServiceOptions) {
    super()
    this.repository = new SyncRepository(options.db)
  }

  private get now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private tokens(): GoogleTokens | null {
    const raw = this.options.settings.getSecret(TOKENS_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as GoogleTokens
    } catch {
      return null
    }
  }

  private deviceId(): string {
    let id = this.options.settings.get<string>(DEVICE_ID_KEY)
    if (!id) {
      id = randomUUID()
      this.options.settings.set(DEVICE_ID_KEY, id)
    }
    return id
  }

  deviceName(): string {
    return this.options.settings.get<string>(DEVICE_NAME_KEY) || hostname()
  }

  setDeviceName(name: string): void {
    this.options.settings.set(DEVICE_NAME_KEY, name)
    this.emit('changed')
    this.soon()
  }

  status(): SyncStatus {
    const tokens = this.tokens()
    return {
      configured: this.options.client !== null,
      signedIn: tokens !== null,
      email: tokens?.email ?? null,
      deviceName: this.deviceName(),
      lastSyncAt: this.options.settings.get<string>(LAST_SYNC_KEY) ?? null,
      lastError: this.lastError,
      running: this.running !== null,
      devices: this.options.settings.get<SyncDevice[]>(DEVICES_KEY) ?? []
    }
  }

  async signIn(): Promise<void> {
    if (!this.options.client) throw new Error('Tato verze Kinotéky nemá klíč pro Google.')
    const tokens = await signIn({
      fetch: this.options.fetch,
      endpoints: this.options.endpoints,
      client: this.options.client,
      open: this.options.openUrl
    })
    this.options.settings.setSecret(TOKENS_KEY, JSON.stringify(tokens))
    this.lastError = null
    this.emit('changed')
    void this.syncNow()
  }

  async signOut(): Promise<void> {
    const tokens = this.tokens()
    // Běžící synchronizace nesmí po odhlášení nic zapsat zpět (klíče, stav) – počkat na ni.
    this.session++
    this.again = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    await this.running?.catch(() => undefined)
    this.options.settings.delete(TOKENS_KEY)
    this.options.settings.delete(FILE_ID_KEY)
    this.options.settings.delete(DEVICES_KEY)
    this.options.settings.delete(LAST_SYNC_KEY)
    // Po přihlášení k jinému účtu se začne znovu (místní data se nahrají jako nová).
    this.repository.clear()
    this.downloaded.clear()
    this.lastError = null
    this.emit('changed')
    if (tokens) await revoke(this.options.fetch, this.options.endpoints, tokens.refreshToken)
  }

  /** Spustí synchronizaci po krátké pauze (víc změn najednou). */
  soon(delayMs = SYNC_DELAY_MS): void {
    if (!this.tokens()) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.syncNow()
    }, delayMs)
  }

  /** Synchronizace po spuštění a pak pravidelně. */
  start(): void {
    this.soon(3000)
    this.interval ??= setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.interval) clearInterval(this.interval)
    this.timer = this.interval = null
  }

  /** Synchronizace hned; během běžící se naplánuje ještě jedna. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.run().finally(() => {
      this.running = null
      this.emit('changed')
      if (this.again) {
        this.again = false
        void this.syncNow()
      }
    })
    this.emit('changed')
    return this.running
  }

  private async run(): Promise<void> {
    const client = this.options.client
    let tokens = this.tokens()
    if (!client || !tokens) return
    const session = this.session
    /** Mezitím odhlášeno – nic nezapisovat. */
    const stale = (): boolean => session !== this.session
    const drive = new DriveClient(this.options.fetch, this.options.drive, async () => {
      const fresh = await refreshTokens(this.options.fetch, this.options.endpoints, client, tokens!)
      if (stale()) throw new Error('Odhlášeno.')
      if (fresh !== tokens) {
        tokens = fresh
        this.options.settings.setSecret(TOKENS_KEY, JSON.stringify(fresh))
      }
      return fresh.accessToken
    })
    try {
      const deviceId = this.deviceId()
      const ownName = `${FILE_PREFIX}${deviceId}.json`
      const files = await drive.list()
      const others: DeviceFile[] = []
      for (const file of files) {
        if (!file.name.startsWith(FILE_PREFIX) || file.name === ownName) continue
        const cached = this.downloaded.get(file.id)
        if (cached && cached.modifiedTime === file.modifiedTime) {
          others.push(cached.file)
          continue
        }
        const parsed = parseDeviceFile(await drive.download(file.id))
        if (!parsed) continue
        this.downloaded.set(file.id, { modifiedTime: file.modifiedTime, file: parsed })
        others.push(parsed)
      }

      if (stale()) return
      const at = this.now.toISOString()
      const result = transaction(this.options.db, () =>
        merge(this.repository, this.options.adapters, others, deviceId, at)
      )
      for (const error of result.errors) console.warn(`Sdílení: ${error}`)

      const content = JSON.stringify({
        format: 1,
        device: { id: deviceId, name: this.deviceName() },
        updatedAt: at,
        entities: result.own
      } satisfies DeviceFile)
      const ownFile = files.find((file) => file.name === ownName)
      if (ownFile) await drive.update(ownFile.id, content)
      else this.options.settings.set(FILE_ID_KEY, await drive.create(ownName, content))
      if (stale()) return

      this.options.settings.set(LAST_SYNC_KEY, at)
      this.options.settings.set(
        DEVICES_KEY,
        others.map((file) => ({ name: file.device.name || 'Počítač', updatedAt: file.updatedAt }))
      )
      this.lastError = null
      if (result.applied > 0) this.options.onApplied()
    } catch (error) {
      if (stale()) return
      const revoked = (error as { revoked?: boolean }).revoked === true
      const denied = error instanceof DriveError && error.status === 401
      this.lastError =
        revoked || denied
          ? 'Přihlášení ke Google vypršelo nebo bylo zrušeno – přihlas se prosím znovu.'
          : /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_INTERNET/i.test(String(error))
            ? 'Bez připojení k internetu – změny se pošlou, až bude síť.'
            : (error as Error).message
      console.warn(`Sdílení: ${this.lastError}`)
    }
  }
}
