/** Ústřední melodie filmu nebo seriálu, která potichu hraje na stránce titulu. */

export interface ThemeSettings {
  /** Přehrávat melodii na stránce filmu a seriálu. */
  enabled: boolean
  /** Hlasitost 0–100 %. */
  volume: number
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = { enabled: true, volume: 25 }

export function parseThemeSettings(value: unknown): ThemeSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const volume = raw['volume']
  return {
    enabled: typeof raw['enabled'] === 'boolean' ? raw['enabled'] : DEFAULT_THEME_SETTINGS.enabled,
    volume:
      typeof volume === 'number' && Number.isFinite(volume)
        ? Math.min(100, Math.max(0, Math.round(volume)))
        : DEFAULT_THEME_SETTINGS.volume
  }
}

/** Přípony zvukových souborů, které jde použít jako melodii. */
export const THEME_EXTENSIONS = ['mp3', 'm4a', 'ogg', 'opus', 'flac', 'wav', 'webm'] as const

/**
 * Odkud melodie je: local = soubor vedle filmu nebo ve složce seriálu, file = soubor
 * vybraný v aplikaci, youtube = stažená z odkazu, none = titul je výslovně bez melodie.
 */
export type ThemeSource = 'local' | 'file' | 'youtube' | 'none'

export interface ThemeInfo {
  /** Adresa pro přehrávání (kinoteka-media://theme/…); null = bez melodie. */
  url: string | null
  /** null = melodie není a nikdo nic nevybral. */
  source: ThemeSource | null
  /** Odkaz, ze kterého se melodie stáhla (source youtube). */
  link: string | null
}

export type ThemeResult = { ok: true; info: ThemeInfo } | { ok: false; message: string }
