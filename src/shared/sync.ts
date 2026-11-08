/** Sdílení mezi počítači přes Google Disk (SCOPE-SYNC.md). */

export interface SyncDevice {
  name: string
  /** Kdy ten počítač naposledy nahrál změny (ISO). */
  updatedAt: string
}

export interface SyncStatus {
  /** Verze aplikace má klíč pro Google (bez něj sdílení nejde zapnout). */
  configured: boolean
  signedIn: boolean
  email: string | null
  deviceName: string
  lastSyncAt: string | null
  /** Chyba poslední synchronizace; null = v pořádku. */
  lastError: string | null
  running: boolean
  /** Ostatní počítače, které sdílí stejná data. */
  devices: SyncDevice[]
}

export const MAX_DEVICE_NAME = 40

/** Název počítače z okna (oříznutý, bez řídicích znaků); null = neplatný. */
export function cleanDeviceName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, MAX_DEVICE_NAME)
  return name || null
}
