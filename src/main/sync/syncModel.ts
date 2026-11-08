import type { Database } from '../db/database'

/**
 * Model sdílení mezi počítači: každý sdílený záznam (záznam deníku, hodnocení, YT video…)
 * má klíč, data, čas poslední změny a počítač, který ji udělal. Smazaný záznam zůstává
 * jako „náhrobek“ (deleted + poslední data), aby se smazaná věc znovu nevrátila.
 * Při rozporu vyhraje novější změna (při shodném čase počítač s větším ID – stejně všude).
 */
export interface SyncEntity {
  key: string
  data: unknown
  updatedAt: string
  device: string
  deleted: boolean
}

/** Soubor jednoho počítače na Google Disku – zapisuje ho jen ten počítač. */
export interface DeviceFile {
  format: 1
  device: { id: string; name: string }
  updatedAt: string
  entities: SyncEntity[]
}

export const isNewer = (a: SyncEntity, b: Pick<SyncEntity, 'updatedAt' | 'device'>): boolean =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.device > b.device)

/** JSON se seřazenými klíči – stejná data mají vždy stejný zápis (porovnávání změn). */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const isEntity = (value: unknown): value is SyncEntity => {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e['key'] === 'string' &&
    typeof e['updatedAt'] === 'string' &&
    typeof e['device'] === 'string' &&
    typeof e['deleted'] === 'boolean'
  )
}

/** Soubor počítače z Disku; null = poškozený nebo neznámý formát (přeskočí se). */
export function parseDeviceFile(text: string): DeviceFile | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null) return null
  const file = json as Record<string, unknown>
  const device = file['device'] as Record<string, unknown> | undefined
  if (file['format'] !== 1 || typeof device?.['id'] !== 'string') return null
  return {
    format: 1,
    device: { id: device['id'], name: typeof device['name'] === 'string' ? device['name'] : '' },
    updatedAt: typeof file['updatedAt'] === 'string' ? file['updatedAt'] : '',
    entities: Array.isArray(file['entities']) ? file['entities'].filter(isEntity) : []
  }
}

/** Sdílený záznam v databázi a jeho podoba v tomto počítači při poslední synchronizaci. */
export interface StoredEntity extends SyncEntity {
  /** canonical(místní podoba) – podle ní se poznají místní změny; null = místně neexistuje. */
  localSig: string | null
}

/** Tabulka sync_entity. */
export class SyncRepository {
  constructor(private readonly db: Database) {}

  all(): StoredEntity[] {
    return this.db
      .prepare('SELECT key, data, updated_at, device, deleted, local_sig FROM sync_entity')
      .all()
      .map((row) => ({
        key: String(row['key']),
        data: row['data'] === null ? null : JSON.parse(String(row['data'])),
        updatedAt: String(row['updated_at']),
        device: String(row['device']),
        deleted: row['deleted'] === 1,
        localSig: (row['local_sig'] as string | null) ?? null
      }))
  }

  put(entity: StoredEntity): void {
    this.db
      .prepare(
        `INSERT INTO sync_entity (key, data, updated_at, device, deleted, local_sig)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
           device = excluded.device, deleted = excluded.deleted, local_sig = excluded.local_sig`
      )
      .run(
        entity.key,
        entity.data === null || entity.data === undefined ? null : JSON.stringify(entity.data),
        entity.updatedAt,
        entity.device,
        entity.deleted ? 1 : 0,
        entity.localSig
      )
  }

  setLocalSig(key: string, localSig: string | null): void {
    this.db.prepare('UPDATE sync_entity SET local_sig = ? WHERE key = ?').run(localSig, key)
  }

  clear(): void {
    this.db.exec('DELETE FROM sync_entity')
  }
}

/**
 * Jedna oblast sdílených dat (deník, YT videa…): umí popsat místní stav jako záznamy
 * a promítnout do počítače změnu z jiného počítače.
 */
export interface SyncAdapter {
  /** Předpona klíčů této oblasti („denik:“). */
  prefix: string
  /** Místní stav: klíč → data. */
  snapshot(): Map<string, unknown>
  /** Promítne záznam z jiného počítače (deleted = smazat). */
  apply(entity: SyncEntity): void
}

export interface MergeResult {
  /** Soubor tohoto počítače k nahrání na Disk. */
  own: SyncEntity[]
  /** Kolik změn z jiných počítačů se promítlo. */
  applied: number
  /** Kolik místních změn se našlo. */
  local: number
  errors: string[]
}

/**
 * Jedna synchronizace: najde místní změny (proti stavu při poslední synchronizaci),
 * promítne novější změny z jiných počítačů a vrátí soubor tohoto počítače.
 */
export function merge(
  repository: SyncRepository,
  adapters: readonly SyncAdapter[],
  remote: readonly DeviceFile[],
  device: string,
  now: string
): MergeResult {
  const stored = new Map(repository.all().map((entity) => [entity.key, entity]))
  const snapshot = (): Map<string, string> => {
    const all = new Map<string, string>()
    for (const adapter of adapters)
      for (const [key, data] of adapter.snapshot()) all.set(key, canonical(data))
    return all
  }

  // 1) Místní změny: nové, upravené a smazané záznamy.
  let local = 0
  const current = snapshot()
  for (const [key, sig] of current) {
    const known = stored.get(key)
    if (known && known.localSig === sig) continue
    const entity: StoredEntity = {
      key,
      data: JSON.parse(sig),
      updatedAt: now,
      device,
      deleted: false,
      localSig: sig
    }
    repository.put(entity)
    stored.set(key, entity)
    local++
  }
  for (const known of stored.values()) {
    if (known.localSig === null || current.has(known.key)) continue
    const entity: StoredEntity = { ...known, updatedAt: now, device, deleted: true, localSig: null }
    repository.put(entity)
    stored.set(known.key, entity)
    local++
  }

  // 2) Změny z jiných počítačů – u každého klíče nejnovější; smazání před ostatními.
  const best = new Map<string, SyncEntity>()
  for (const file of remote)
    for (const entity of file.entities) {
      const seen = best.get(entity.key)
      if (!seen || isNewer(entity, seen)) best.set(entity.key, entity)
    }
  const incoming = [...best.values()]
    .filter((entity) => {
      const known = stored.get(entity.key)
      return !known || isNewer(entity, known)
    })
    .sort((a, b) => Number(b.deleted) - Number(a.deleted))
  const errors: string[] = []
  const touched: string[] = []
  for (const entity of incoming) {
    const adapter = adapters.find((a) => entity.key.startsWith(a.prefix))
    if (!adapter) continue // Oblast, kterou tato verze ještě nezná – pošle se dál beze změny.
    try {
      adapter.apply(entity)
    } catch (error) {
      errors.push(`${entity.key}: ${(error as Error).message}`)
      continue
    }
    const updated: StoredEntity = { ...entity, localSig: null }
    repository.put(updated)
    stored.set(entity.key, updated)
    touched.push(entity.key)
  }
  // Neznámé oblasti (novější verze na jiném PC) se uloží, aby se neztratily.
  for (const entity of incoming)
    if (!adapters.some((a) => entity.key.startsWith(a.prefix))) {
      const updated: StoredEntity = { ...entity, localSig: null }
      repository.put(updated)
      stored.set(entity.key, updated)
    }

  // 3) Podoba promítnutých záznamů v tomto počítači – další synchronizace je nevezme jako
  //    místní změnu (místní podoba se může lišit, např. název titulu podle místního TMDB).
  if (touched.length > 0) {
    const after = snapshot()
    for (const key of touched) repository.setLocalSig(key, after.get(key) ?? null)
  }

  return {
    own: [...stored.values()].map(({ localSig: _, ...entity }) => entity),
    applied: touched.length,
    local,
    errors
  }
}
