import { EventEmitter } from 'node:events'
import { parseCsfdUrl } from '../../shared/csfd'
import type { ActionResult } from '../../shared/metadata'
import type { CatalogRepository } from '../catalog/CatalogRepository'
import type { SettingsRepository } from '../settings/SettingsRepository'
import { parseCsfd } from './parseCsfd'
import { csfdIdsFromWikidata, WIKIDATA_SPARQL_URL } from './wikidata'

export const CSFD_URL = 'https://www.csfd.cz'
const ENABLED_SETTING = 'csfd.enabled'

/** Pauza mezi stránkami ČSFD – aplikace se má chovat jako člověk, ne jako robot. */
export const CSFD_DELAY_MS = 5000

interface CsfdServiceEvents {
  changed: []
}

export interface CsfdServiceOptions {
  fetch: typeof fetch
  baseUrl?: string
  wikidataUrl?: string
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

/** ČSFD odpověděl, že požadavků je moc / přístup odepřen – další stránky teď nezkoušet. */
class CsfdBlockedError extends Error {}

/**
 * Údaje z ČSFD. ID filmu zjistí přes Wikidata (podle TMDB ID), na ČSFD nic nevyhledává.
 * Stránky filmů načítá po jedné s pauzou a obnovuje je nejvýš jednou za 30 dní.
 */
export class CsfdService extends EventEmitter<CsfdServiceEvents> {
  private running: Promise<void> | null = null
  private again = false
  private lastRequestAt = 0
  private readonly baseUrl: string
  private readonly delayMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private readonly catalog: CatalogRepository,
    private readonly settings: SettingsRepository,
    private readonly options: CsfdServiceOptions
  ) {
    super()
    this.baseUrl = (options.baseUrl ?? CSFD_URL).replace(/\/$/, '')
    this.delayMs = options.delayMs ?? CSFD_DELAY_MS
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  enabled(): boolean {
    return this.settings.get<boolean>(ENABLED_SETTING) ?? true
  }

  setEnabled(enabled: boolean): void {
    this.settings.set(ENABLED_SETTING, enabled)
    this.emit('changed')
    if (enabled) void this.run()
  }

  /** Ruční propojení odkazem z ČSFD (když ho Wikidata nezná nebo je špatně). */
  async link(titleId: number, url: string): Promise<ActionResult> {
    const csfdId = parseCsfdUrl(url)
    if (!csfdId)
      return {
        ok: false,
        message: 'Vlož odkaz na film z ČSFD, např. https://www.csfd.cz/film/117181-drz-hubu/'
      }
    this.catalog.setCsfdLink(titleId, csfdId, 'manual')
    this.catalog.expireCsfd(titleId)
    this.emit('changed')
    void this.run()
    return { ok: true }
  }

  refresh(titleId: number): void {
    this.catalog.expireCsfd(titleId)
    void this.run()
  }

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
      if (!this.enabled()) return
      await this.lookupIds()
      try {
        for (const { id, csfdId } of this.catalog.csfdFetches()) {
          if (!this.enabled()) return
          await this.fetchTitle(id, csfdId)
        }
      } catch (error) {
        if (error instanceof CsfdBlockedError) return
        throw error
      }
    } while (this.again)
  }

  /** ID z ČSFD přes Wikidata – dávkově pro všechny tituly, které ho ještě nemají. */
  private async lookupIds(): Promise<void> {
    const lookups = this.catalog.csfdLookups()
    for (const kind of ['movie', 'show'] as const) {
      const titles = lookups.filter((t) => t.kind === kind)
      if (titles.length === 0) continue
      let ids: Map<number, number>
      try {
        ids = await csfdIdsFromWikidata(
          kind,
          titles.map((t) => t.tmdbId),
          this.options.fetch,
          this.options.wikidataUrl ?? WIKIDATA_SPARQL_URL
        )
      } catch (error) {
        // Wikidata nedostupná – zkusí se při příštím běhu
        console.warn(`Wikidata: ${(error as Error).message}`)
        return
      }
      for (const title of titles) {
        const csfdId = ids.get(title.tmdbId)
        this.catalog.setCsfdLink(title.id, csfdId ?? null, csfdId ? 'linked' : 'notfound')
      }
      this.emit('changed')
    }
  }

  private async fetchTitle(titleId: number, csfdId: number): Promise<void> {
    const wait = this.lastRequestAt + this.delayMs - Date.now()
    if (this.lastRequestAt && wait > 0) await this.sleep(wait)
    this.lastRequestAt = Date.now()

    const url = `${this.baseUrl}/film/${csfdId}/prehled/`
    try {
      const response = await this.options.fetch(url, { headers: { 'Accept-Language': 'cs' } })
      if (response.status === 429 || response.status === 403) {
        this.catalog.setCsfdError(
          titleId,
          `ČSFD odmítlo požadavek (HTTP ${response.status}), zkusí se později.`
        )
        this.emit('changed')
        throw new CsfdBlockedError()
      }
      if (!response.ok) throw new Error(`ČSFD vrátilo chybu HTTP ${response.status}`)
      const film = parseCsfd(await response.text(), url)
      if (!film)
        throw new Error('Stránku ČSFD se nepodařilo přečíst (možná se změnil její vzhled).')
      this.catalog.saveCsfd(titleId, film)
    } catch (error) {
      if (error instanceof CsfdBlockedError) throw error
      this.catalog.setCsfdError(titleId, (error as Error).message)
    }
    this.emit('changed')
  }
}
