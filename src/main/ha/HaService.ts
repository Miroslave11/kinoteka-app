import { EventEmitter } from 'node:events'
import {
  cleanHaLabel,
  DEFAULT_HA_SETTINGS,
  isToggleEntityId,
  normalizeHaUrl,
  parseHaSettings,
  HA_TOGGLE_DOMAINS,
  type HaActionResult,
  type HaConnectionState,
  type HaEntityOption,
  type HaEntityState,
  type HaSettings,
  type HaSettingsPatch,
  type HaStatus,
  type HaTestResult
} from '../../shared/ha'
import type { SettingsRepository } from '../settings/SettingsRepository'
import { HaConnection, HaError, type HaEntitySnapshot } from './HaConnection'

export const HA_SETTINGS_KEY = 'ha.settings'
export const HA_TOKEN_KEY = 'ha.token'

/** Prodlevy mezi pokusy o nové spojení (poslední se opakuje). */
const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

export type HaConnect = (url: string, token: string) => Promise<HaConnection>

export interface HaServiceOptions {
  settings: SettingsRepository
  connect?: HaConnect
  retryMs?: number[]
}

const friendlyName = (entityId: string, attributes?: Record<string, unknown>): string => {
  const name = attributes?.['friendly_name']
  return typeof name === 'string' && name ? name : entityId
}

/**
 * Trvalé spojení s Home Assistant: drží živý stav vybrané entity, přepíná ji a po výpadku
 * se samo znovu připojí. Událost 'changed' (s HaStatus) při každé změně stavu.
 */
export class HaService extends EventEmitter {
  private connection: HaConnection | null = null
  private state: HaConnectionState = 'off'
  private error: string | null = null
  private version: string | null = null
  private location: string | null = null
  private entity: HaEntityState | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  /** Zvyšuje se při každém novém připojení – starší pokusy se pak zahodí. */
  private generation = 0
  private connecting: Promise<void> | null = null

  constructor(private readonly options: HaServiceOptions) {
    super()
  }

  private get retryMs(): number[] {
    return this.options.retryMs ?? RETRY_MS
  }

  private connectWith(url: string, token: string): Promise<HaConnection> {
    return (this.options.connect ?? ((u, t) => HaConnection.open(u, t)))(url, token)
  }

  settings(): HaSettings {
    return parseHaSettings(this.options.settings.get(HA_SETTINGS_KEY) ?? DEFAULT_HA_SETTINGS)
  }

  private token(): string | undefined {
    return this.options.settings.getSecret(HA_TOKEN_KEY) || undefined
  }

  status(): HaStatus {
    return {
      settings: this.settings(),
      hasToken: !!this.token(),
      connection: this.state,
      error: this.error,
      haVersion: this.version,
      locationName: this.location,
      entity: this.entity
    }
  }

  private changed(): void {
    this.emit('changed', this.status())
  }

  /** Připojí se, pokud je funkce zapnutá a vyplněná (volá se po spuštění aplikace). */
  start(): void {
    void this.reconnect()
  }

  stop(): void {
    this.generation++
    this.clearRetry()
    this.connection?.close()
    this.connection = null
  }

  async save(patch: HaSettingsPatch): Promise<HaStatus> {
    const current = this.settings()
    const next: HaSettings = { ...current }
    if (patch.enabled !== undefined) next.enabled = patch.enabled === true
    if (patch.url !== undefined) next.url = normalizeHaUrl(patch.url) ?? current.url
    if (patch.entityId !== undefined)
      next.entityId = isToggleEntityId(patch.entityId) ? patch.entityId : null
    if (patch.label !== undefined) next.label = cleanHaLabel(patch.label)
    this.options.settings.set(HA_SETTINGS_KEY, next)
    if (typeof patch.token === 'string') {
      const token = patch.token.trim()
      if (token) this.options.settings.setSecret(HA_TOKEN_KEY, token)
      else this.options.settings.delete(HA_TOKEN_KEY)
    }
    const reconnect =
      patch.token !== undefined ||
      next.enabled !== current.enabled ||
      next.url !== current.url ||
      next.entityId !== current.entityId
    if (reconnect) await this.reconnect()
    else this.changed()
    return this.status()
  }

  /** Zkusí adresu a token (z okna, jinak uložený) bez uložení. */
  async test(url: unknown, token?: unknown): Promise<HaTestResult> {
    const base = normalizeHaUrl(url)
    if (!base) return { ok: false, message: 'Zadej adresu, např. http://homeassistant.local:8123.' }
    const key = (typeof token === 'string' && token.trim()) || this.token()
    if (!key) return { ok: false, message: 'Zadej dlouhodobý přístupový token.' }
    let connection: HaConnection | null = null
    try {
      connection = await this.connectWith(base, key)
      const config = await connection.getConfig()
      const version = config.version || connection.version
      return {
        ok: true,
        message: `Připojeno – ${config.location_name ?? 'Home Assistant'}, Home Assistant ${version}`,
        version,
        locationName: config.location_name
      }
    } catch (error) {
      return { ok: false, message: describe(error, base) }
    } finally {
      connection?.close()
    }
  }

  /** Entity, které jde přepínat (pro výběr v Nastavení), seřazené podle názvu. */
  async entities(): Promise<HaEntityOption[]> {
    const connection = await this.ensureConnection()
    const states = await connection.getStates()
    return states
      .filter((s) => isToggleEntityId(s.entity_id))
      .map((s) => ({
        entityId: s.entity_id,
        friendlyName: friendlyName(s.entity_id, s.attributes),
        state: s.state
      }))
      .sort(
        (a, b) =>
          HA_TOGGLE_DOMAINS.indexOf(domainOf(a.entityId)) -
            HA_TOGGLE_DOMAINS.indexOf(domainOf(b.entityId)) ||
          a.friendlyName.localeCompare(b.friendlyName, 'cs')
      )
  }

  /** Přepne vybranou entitu (žárovka, klávesa L). */
  toggle(): Promise<HaActionResult> {
    return this.call('toggle')
  }

  /** Zapne / vypne vybranou entitu (automatika podle přehrávání). */
  setOn(on: boolean): Promise<HaActionResult> {
    return this.call(on ? 'turn_on' : 'turn_off')
  }

  private async call(service: 'toggle' | 'turn_on' | 'turn_off'): Promise<HaActionResult> {
    const { enabled, entityId } = this.settings()
    if (!enabled || !entityId) return { ok: false, message: 'Home Assistant není nastavený.' }
    try {
      const connection = await this.ensureConnection()
      await connection.callService(domainOf(entityId), service, entityId)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: describe(error, this.settings().url) }
    }
  }

  /** Aktuální spojení; když není, zkusí se hned připojit (bez čekání na další pokus). */
  private async ensureConnection(): Promise<HaConnection> {
    if (this.connection?.isOpen) return this.connection
    await (this.connecting ?? this.reconnect())
    if (this.connection?.isOpen) return this.connection
    throw new HaError('network', this.error ?? 'Home Assistant není připojený.')
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  /** Zahodí staré spojení a podle nastavení otevře nové. */
  private reconnect(): Promise<void> {
    const generation = ++this.generation
    this.clearRetry()
    this.connection?.close()
    this.connection = null
    this.entity = null
    const { enabled, url, entityId } = this.settings()
    const token = this.token()
    if (!enabled || !token) {
      this.state = 'off'
      this.error = null
      this.connecting = null
      this.changed()
      return Promise.resolve()
    }
    this.state = 'connecting'
    this.changed()
    const run = (async () => {
      try {
        const connection = await this.connectWith(url, token)
        if (generation !== this.generation) return connection.close()
        this.connection = connection
        connection.onClose(() => {
          if (generation !== this.generation) return
          this.connection = null
          this.entity = null
          this.state = 'error'
          this.error = 'Spojení s Home Assistant se přerušilo.'
          this.changed()
          this.scheduleRetry()
        })
        const config = await connection.getConfig().catch(() => null)
        this.version = config?.version || connection.version
        this.location = config?.location_name ?? null
        if (entityId) {
          await connection.subscribeEntities([entityId], (entities) => {
            if (generation !== this.generation) return
            this.entity = entityState(entityId, entities.get(entityId))
            this.changed()
          })
        }
        if (generation !== this.generation) return
        this.attempt = 0
        this.state = 'connected'
        this.error = null
        this.entity ??= entityId ? entityState(entityId, undefined) : null
        this.changed()
      } catch (error) {
        if (generation !== this.generation) return
        this.connection?.close()
        this.connection = null
        this.state = 'error'
        this.error = describe(error, url)
        this.changed()
        // Neplatný token se sám nespraví – další pokus až po změně nastavení.
        if (!(error instanceof HaError && error.code === 'auth')) this.scheduleRetry()
      } finally {
        if (generation === this.generation) this.connecting = null
      }
    })()
    this.connecting = run
    return run
  }

  private scheduleRetry(): void {
    this.clearRetry()
    const delay = this.retryMs[Math.min(this.attempt, this.retryMs.length - 1)]!
    this.attempt++
    this.retryTimer = setTimeout(() => void this.reconnect(), delay)
  }
}

function domainOf(entityId: string): (typeof HA_TOGGLE_DOMAINS)[number] {
  return entityId.split('.')[0] as (typeof HA_TOGGLE_DOMAINS)[number]
}

/** Entita, kterou Home Assistant nezná, se hlásí jako nedostupná. */
function entityState(entityId: string, snapshot: HaEntitySnapshot | undefined): HaEntityState {
  return {
    entityId,
    state: snapshot?.state ?? 'unavailable',
    friendlyName: friendlyName(entityId, snapshot?.attributes)
  }
}

function describe(error: unknown, url: string): string {
  if (error instanceof HaError) {
    if (error.code === 'network')
      return url.includes('.local')
        ? `${error.message} (${url}) Zkontroluj adresu, případně místo .local zkus IP adresu.`
        : `${error.message} (${url}) Zkontroluj adresu.`
    return error.message
  }
  return (error as Error)?.message ?? 'Neznámá chyba.'
}
