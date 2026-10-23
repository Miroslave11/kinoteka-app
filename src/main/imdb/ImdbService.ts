import { EventEmitter } from 'node:events'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import type { ImdbStatus } from '../../shared/metadata'
import type { CatalogRepository } from '../catalog/CatalogRepository'
import type { SettingsRepository } from '../settings/SettingsRepository'

/** Oficiální datový soubor IMDb s hodnocením všech titulů (aktualizovaný denně, ~9 MB). */
export const IMDB_RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz'
const FILE_NAME = 'title.ratings.tsv.gz'
/** Hodnocení se mění pomalu – stačí stáhnout jednou týdně. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const SETTING = {
  enabled: 'imdb.enabled',
  downloadedAt: 'imdb.downloadedAt',
  etag: 'imdb.etag',
  lastModified: 'imdb.lastModified',
  error: 'imdb.error'
} as const

export type Ratings = Map<string, { rating: number; votes: number }>

/** Přečte datový soubor (tconst, averageRating, numVotes) a vrátí jen hledané tituly. */
export async function readRatings(gzPath: string, wanted: Set<string>): Promise<Ratings> {
  const ratings: Ratings = new Map()
  if (wanted.size === 0) return ratings
  const lines = createInterface({
    input: createReadStream(gzPath).pipe(createGunzip()),
    crlfDelay: Infinity
  })
  for await (const line of lines) {
    const tab = line.indexOf('\t')
    if (tab < 0 || !wanted.has(line.slice(0, tab))) continue
    const [id, rating, votes] = line.split('\t')
    const value = Number(rating)
    const count = Number(votes)
    if (Number.isFinite(value) && Number.isFinite(count))
      ratings.set(id!, { rating: value, votes: count })
  }
  return ratings
}

interface ImdbServiceEvents {
  changed: []
}

export interface ImdbServiceOptions {
  fetch: typeof fetch
  cacheDir: string
  url?: string
  now?: () => Date
}

/**
 * Hodnocení z IMDb pro tituly v knihovně. Místo dotazu na každý film stáhne jednou týdně
 * oficiální datový soubor IMDb a hodnocení v něm najde lokálně podle IMDb ID z TMDB.
 */
export class ImdbService extends EventEmitter<ImdbServiceEvents> {
  private running: Promise<void> | null = null
  private again = false
  private force = false

  constructor(
    private readonly catalog: CatalogRepository,
    private readonly settings: SettingsRepository,
    private readonly options: ImdbServiceOptions
  ) {
    super()
  }

  private get file(): string {
    return join(this.options.cacheDir, FILE_NAME)
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  enabled(): boolean {
    return this.settings.get<boolean>(SETTING.enabled) ?? true
  }

  setEnabled(enabled: boolean): void {
    this.settings.set(SETTING.enabled, enabled)
    this.emit('changed')
    if (enabled) void this.run()
  }

  status(): ImdbStatus {
    return {
      enabled: this.enabled(),
      downloadedAt: this.settings.get<string>(SETTING.downloadedAt) ?? null,
      datasetDate: this.settings.get<string>(SETTING.lastModified) ?? null,
      ...this.catalog.imdbCounts(),
      updating: this.running !== null,
      error: this.settings.get<string>(SETTING.error) ?? null
    }
  }

  /** Stáhne datový soubor hned (tlačítko „Aktualizovat teď“). */
  updateNow(): Promise<void> {
    this.force = true
    return this.run()
  }

  run(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.emit('changed')
    this.running = this.loop().finally(() => {
      this.running = null
      this.emit('changed')
    })
    return this.running
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      if (!this.enabled()) return
      let fresh = false
      try {
        fresh = await this.download()
        this.settings.delete(SETTING.error)
      } catch (error) {
        // Bez internetu se použije starší stažený soubor, pokud existuje.
        this.settings.set(
          SETTING.error,
          `Hodnocení IMDb nejde stáhnout: ${(error as Error).message}`
        )
      }
      if (existsSync(this.file) && (fresh || this.catalog.countMissingImdbRatings() > 0)) {
        const targets = this.catalog.imdbIds()
        const ratings = await readRatings(this.file, new Set(targets.map((t) => t.imdbId)))
        this.catalog.saveImdbRatings(ratings, targets, this.now())
        // Další tituly mohly IMDb ID dostat během čtení souboru – doplní se v dalším kole.
        if (this.catalog.countMissingImdbRatings() > 0) this.again = true
      }
    } while (this.again)
  }

  /** Stáhne soubor, je-li starší než týden (nebo vynuceně). Vrací true, když přišla nová verze. */
  private async download(): Promise<boolean> {
    const force = this.force
    this.force = false
    const downloadedAt = this.settings.get<string>(SETTING.downloadedAt)
    const age = downloadedAt ? this.now().getTime() - new Date(downloadedAt).getTime() : Infinity
    if (!force && existsSync(this.file) && age < MAX_AGE_MS) return false

    // Podmíněný požadavek: když se soubor na IMDb nezměnil, nic se nestahuje (HTTP 304).
    const headers: Record<string, string> = {}
    const etag = this.settings.get<string>(SETTING.etag)
    if (etag && existsSync(this.file)) headers['If-None-Match'] = etag
    const response = await this.options.fetch(this.options.url ?? IMDB_RATINGS_URL, { headers })
    const timestamp = this.now().toISOString()
    if (response.status === 304) {
      this.settings.set(SETTING.downloadedAt, timestamp)
      return false
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = Buffer.from(await response.arrayBuffer())
    await mkdir(this.options.cacheDir, { recursive: true })
    await writeFile(`${this.file}.part`, data)
    await rename(`${this.file}.part`, this.file)
    this.settings.set(SETTING.downloadedAt, timestamp)
    this.settings.set(SETTING.etag, response.headers.get('ETag') ?? '')
    const lastModified = response.headers.get('Last-Modified')
    if (lastModified) this.settings.set(SETTING.lastModified, new Date(lastModified).toISOString())
    return true
  }
}
