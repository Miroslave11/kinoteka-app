import { EventEmitter } from 'node:events'
import type {
  MetadataSearchResult,
  SaveKeyResult,
  TitleMetadata,
  TmdbKeyStatus
} from '../../shared/metadata'
import type { CatalogRepository, MetadataRequest } from '../catalog/CatalogRepository'
import type { SettingsRepository } from '../settings/SettingsRepository'
import { mapMovie, mapSearchResults, mapSeason, mapShow, seasonNumbers } from './mapping'
import { pickBestMatch, toCandidates, type SearchCandidate } from './matching'
import { TmdbError, type TmdbClient } from './TmdbClient'

const KEY_SETTING = 'tmdb.key'
const CHECKED_SETTING = 'tmdb.checkedAt'

interface MetadataServiceEvents {
  /** Další tituly mají metadata (nebo se změnil jejich stav). */
  changed: []
}

/** Rozhraní klienta, které služba používá (v testech se nahradí). */
export type TmdbApi = Pick<
  TmdbClient,
  'validate' | 'searchMovie' | 'searchTv' | 'movie' | 'tv' | 'tvSeason'
>

/**
 * Dohledává filmy a seriály na TMDB. Běží na pozadí po každém skenu,
 * bez klíče TMDB nedělá nic.
 */
export class MetadataService extends EventEmitter<MetadataServiceEvents> {
  private running: Promise<void> | null = null
  private again = false

  constructor(
    private readonly catalog: CatalogRepository,
    private readonly settings: SettingsRepository,
    private readonly createClient: (credential: string) => TmdbApi
  ) {
    super()
  }

  keyStatus(): TmdbKeyStatus {
    if (!this.settings.getSecret(KEY_SETTING)) return { configured: false }
    return {
      configured: true,
      valid: true,
      checkedAt: this.settings.get<string>(CHECKED_SETTING) ?? null
    }
  }

  async saveKey(rawKey: string): Promise<SaveKeyResult> {
    const key = rawKey.trim()
    if (key.length < 16 || /\s/.test(key)) {
      return {
        ok: false,
        message: 'Klíč vypadá neplatně – zkopíruj ho celý z nastavení účtu TMDB.'
      }
    }
    try {
      if (!(await this.createClient(key).validate())) {
        return { ok: false, message: 'TMDB klíč odmítlo. Zkontroluj, že je zkopírovaný celý.' }
      }
    } catch (error) {
      return { ok: false, message: `Klíč nejde ověřit: ${(error as Error).message}` }
    }
    this.settings.setSecret(KEY_SETTING, key)
    this.settings.set(CHECKED_SETTING, new Date().toISOString())
    this.catalog.resetUnmatched()
    this.emit('changed')
    void this.run()
    return { ok: true }
  }

  removeKey(): void {
    this.settings.delete(KEY_SETTING)
    this.settings.delete(CHECKED_SETTING)
    this.emit('changed')
  }

  /** Dohledá čekající tituly; souběžná volání se spojí. */
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

  /** Vyhledávání pro dialog „Opravit shodu“. */
  async search(
    kind: 'movie' | 'show',
    query: string,
    year: number | null
  ): Promise<MetadataSearchResult[]> {
    const client = this.client()
    if (!client) throw new Error('Nejdřív zadej klíč TMDB v Nastavení → Metadata.')
    const response =
      kind === 'movie' ? await client.searchMovie(query, year) : await client.searchTv(query, year)
    return mapSearchResults(response, kind).slice(0, 12)
  }

  /** Ruční výběr titulu z TMDB. */
  async applyMatch(titleId: number, tmdbId: number): Promise<void> {
    const client = this.client()
    const request = this.catalog.titleForMetadata(titleId)
    if (!client) throw new Error('Nejdřív zadej klíč TMDB v Nastavení → Metadata.')
    if (!request) throw new Error('Titul už v knihovně není.')
    const metadata = await this.details(client, request.kind, tmdbId)
    this.catalog.saveMetadata(titleId, metadata, 'manual')
    if (this.catalog.mergeByTmdb()) this.catalog.rebuild()
    this.emit('changed')
  }

  /** Znovu načte údaje už spárovaného titulu (např. nové díly). */
  async refresh(titleId: number): Promise<void> {
    const request = this.catalog.titleForMetadata(titleId)
    if (!request) return
    this.catalog.setMatchStatus(titleId, 'pending')
    this.emit('changed')
    await this.run()
  }

  private client(): TmdbApi | null {
    const key = this.settings.getSecret(KEY_SETTING)
    return key ? this.createClient(key) : null
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      const client = this.client()
      if (!client) return
      for (const request of this.catalog.titlesNeedingMetadata()) {
        await this.process(client, request)
      }
    } while (this.again)
  }

  private async process(client: TmdbApi, request: MetadataRequest): Promise<void> {
    try {
      const match = await this.findMatch(client, request)
      if (!match) {
        this.catalog.setMatchStatus(request.id, 'unmatched')
      } else {
        this.catalog.saveMetadata(
          request.id,
          await this.details(client, request.kind, match.id),
          'matched'
        )
        if (this.catalog.mergeByTmdb()) this.catalog.rebuild()
      }
    } catch (error) {
      const message =
        error instanceof TmdbError ? error.message : `Chyba: ${(error as Error).message}`
      this.catalog.setMatchStatus(request.id, 'error', message)
    }
    this.emit('changed')
  }

  /** Hledá podle všech variant názvu, s rokem i bez něj. */
  private async findMatch(
    client: TmdbApi,
    request: MetadataRequest
  ): Promise<SearchCandidate | null> {
    const names = [request.name, ...request.alternativeNames]
    const candidates = new Map<number, SearchCandidate>()
    const search = (name: string, year: number | null): Promise<Record<string, unknown>> =>
      request.kind === 'movie' ? client.searchMovie(name, year) : client.searchTv(name, year)

    for (const name of names) {
      const years = request.year ? [request.year, null] : [null]
      for (const year of years) {
        for (const candidate of toCandidates(await search(name, year))) {
          candidates.set(candidate.id, candidate)
        }
        const best = pickBestMatch(names, request.year, [...candidates.values()])
        if (best) return best
      }
    }
    return null
  }

  private async details(
    client: TmdbApi,
    kind: 'movie' | 'show',
    tmdbId: number
  ): Promise<TitleMetadata> {
    if (kind === 'movie') {
      const metadata = mapMovie(await client.movie(tmdbId))
      // Bez českého popisu aspoň anglický.
      if (!metadata.overview)
        metadata.overview = mapMovie(await client.movie(tmdbId, 'en-US')).overview
      return metadata
    }
    const json = await client.tv(tmdbId)
    const seasons = []
    for (const number of seasonNumbers(json)) seasons.push(await client.tvSeason(tmdbId, number))
    const metadata = mapShow(json, seasons)
    if (!metadata.overview)
      metadata.overview = mapShow(await client.tv(tmdbId, 'en-US'), []).overview
    // Díly bez českého názvu doplní angličtina, aby nezůstaly jen čísla.
    for (const season of metadata.seasons) {
      if (season.episodes.some((e) => !e.name)) {
        const english = mapSeason(await client.tvSeason(tmdbId, season.number, 'en-US'))
        for (const episode of season.episodes) {
          episode.name ??= english.episodes.find((e) => e.number === episode.number)?.name ?? null
        }
      }
    }
    return metadata
  }
}
