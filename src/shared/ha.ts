/** Ovládání entity v Home Assistant (SCOPE-HA.md). */

export const HA_DEFAULT_URL = 'http://homeassistant.local:8123'

/** Domény, které jde zapnout / vypnout / přepnout (žárovka v Kinotéce). */
export const HA_TOGGLE_DOMAINS = ['switch', 'light', 'input_boolean', 'fan'] as const

export const MAX_HA_LABEL = 30

export interface HaSettings {
  enabled: boolean
  /** Adresa Home Assistant, např. http://homeassistant.local:8123 (bez lomítka na konci). */
  url: string
  /** Ovládaná entita, např. switch.vypinac_linka; null = zatím nevybraná. */
  entityId: string | null
  /** Název v bublině a hláškách; prázdný = friendly_name z Home Assistant. */
  label: string
}

export const DEFAULT_HA_SETTINGS: HaSettings = {
  enabled: false,
  url: HA_DEFAULT_URL,
  entityId: null,
  label: ''
}

export type HaConnectionState = 'off' | 'connecting' | 'connected' | 'error'

export interface HaEntityState {
  entityId: string
  /** Stav z Home Assistant: on, off, unavailable, unknown… */
  state: string
  friendlyName: string
}

export interface HaStatus {
  settings: HaSettings
  /** Token je uložený (samotný token do okna nikdy nejde). */
  hasToken: boolean
  connection: HaConnectionState
  /** Srozumitelná chyba připojení; null = v pořádku. */
  error: string | null
  haVersion: string | null
  locationName: string | null
  /** Živý stav ovládané entity; null = neznámý (nepřipojeno / entita nevybraná). */
  entity: HaEntityState | null
}

/** Žárovka v liště a v přehrávači: zda ji ukázat a v jakém stavu. */
export type HaBulbState = 'hidden' | 'on' | 'off' | 'unavailable'

export function haBulbState(status: HaStatus | null): HaBulbState {
  if (!status || !status.settings.enabled || !status.settings.entityId) return 'hidden'
  if (status.connection !== 'connected' || !status.entity) return 'unavailable'
  if (status.entity.state === 'on') return 'on'
  if (status.entity.state === 'off') return 'off'
  return 'unavailable'
}

/** Název pro bublinu a hlášky: vlastní, jinak z Home Assistant, jinak ID entity. */
export function haLabel(status: HaStatus | null): string {
  if (!status) return 'Home Assistant'
  return (
    status.settings.label.trim() ||
    status.entity?.friendlyName ||
    status.settings.entityId ||
    'Home Assistant'
  )
}

export interface HaEntityOption {
  entityId: string
  friendlyName: string
  state: string
}

export interface HaTestResult {
  ok: boolean
  message: string
  version?: string
  locationName?: string
}

export interface HaActionResult {
  ok: boolean
  message?: string
}

/** Změny nastavení z okna; token jen při zadání nového (prázdný řetězec = smazat). */
export interface HaSettingsPatch {
  enabled?: boolean
  url?: string
  entityId?: string | null
  label?: string
  token?: string
}

/**
 * Adresa Home Assistant z okna: doplní http://, odstraní lomítko a cestu na konci.
 * null = neplatná adresa.
 */
export function normalizeHaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let text = value.trim()
  if (!text) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return `${url.protocol}//${url.host}`
}

/** ID entity ve tvaru doména.název z domén, které jde přepínat. */
export function isToggleEntityId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^([a-z_]+)\.[a-z0-9_]+$/.exec(value)
  return !!match && (HA_TOGGLE_DOMAINS as readonly string[]).includes(match[1]!)
}

export function cleanHaLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]/g, '')
      .trim()
      .slice(0, MAX_HA_LABEL)
  )
}

export function parseHaSettings(value: unknown): HaSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    enabled: raw['enabled'] === true,
    url: normalizeHaUrl(raw['url']) ?? HA_DEFAULT_URL,
    entityId: isToggleEntityId(raw['entityId']) ? raw['entityId'] : null,
    label: cleanHaLabel(raw['label'])
  }
}
