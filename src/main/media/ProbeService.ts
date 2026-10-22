import { EventEmitter } from 'node:events'
import type { MediaInfo } from '../../shared/mediaInfo'
import type { Database } from '../db/database'

interface ProbeServiceEvents {
  /** Další soubory mají zjištěné vlastnosti (hlásí se po dávkách). */
  changed: []
}

export type Prober = (path: string) => Promise<MediaInfo>

/**
 * Na pozadí zjišťuje vlastnosti souborů, které je ještě nemají.
 * Soubory jdou postupně, aby analýza nezahltila disk ani NAS.
 */
export class ProbeService extends EventEmitter<ProbeServiceEvents> {
  private running: Promise<void> | null = null
  private again = false

  constructor(
    private readonly db: Database,
    private readonly probe: Prober,
    private readonly notifyEvery = 5
  ) {
    super()
  }

  /** Spustí zpracování; když už běží, doběhne ještě jedno kolo pro nové soubory. */
  run(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.loop().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      await this.processPending()
    } while (this.again)
  }

  private async processPending(): Promise<void> {
    const store = this.db.prepare(
      'UPDATE media_file SET media_info = ?, probe_error = ? WHERE id = ?'
    )
    let sinceNotify = 0
    for (;;) {
      const next = this.db
        .prepare(
          `SELECT id, path FROM media_file
           WHERE media_info IS NULL AND probe_error IS NULL AND available = 1
           ORDER BY id LIMIT 1`
        )
        .get()
      if (!next) break
      const id = Number(next['id'])
      try {
        const info = await this.probe(String(next['path']))
        store.run(JSON.stringify(info), null, id)
      } catch (error) {
        store.run(null, (error as Error).message || 'Analýza souboru selhala', id)
      }
      if (++sinceNotify >= this.notifyEvery) {
        sinceNotify = 0
        this.emit('changed')
      }
    }
    if (sinceNotify > 0) this.emit('changed')
  }
}
