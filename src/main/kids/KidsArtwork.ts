import { EventEmitter } from 'node:events'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  isTmdbImagePath,
  parseTmdbLink,
  type KidsManageResult,
  type KidsTmdbChoice,
  type KidsTmdbResult
} from '../../shared/kids'
import { normalizeTitle } from '../catalog/naming'
import { imageUrl } from '../metadata/mapping'
import { pickBestMatch, toCandidates } from '../metadata/matching'
import type { TmdbApi } from '../metadata/MetadataService'
import type { KidsRepository, StoredTitle } from './KidsRepository'

type Json = Record<string, unknown>

/** Animovaný, dětský nebo rodinný – jen takový pořad se přiřadí automaticky. */
const KIDS_GENRES = new Set([16, 10762, 10751])
/** Kolik obrázků pořadu nabídnout rodiči. */
const MAX_ARTWORK = 8
/** Po chybě sítě nebo klíče se automaticky zkusí znovu až za chvíli. */
const RETRY_AFTER_MS = 10 * 60 * 1000
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : [])
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {}
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null
const yearOf = (date: unknown): number | null => {
  const text = str(date)
  return text && /^\d{4}/.test(text) ? Number(text.slice(0, 4)) : null
}

/**
 * Obrázky pořadu v pořadí, jak se hodí do kulatého obrázku titulu: nejdřív obrázky bez
 * textu (postavičky přes celý obrázek), pak plakáty – na nich bývá i nápis, který kolečko ořízne.
 */
export function pickArtwork(details: Json): string[] {
  const images = obj(details['images'])
  const byVotes = (a: Json, b: Json): number =>
    Number(b['vote_average'] ?? 0) - Number(a['vote_average'] ?? 0) ||
    Number(b['vote_count'] ?? 0) - Number(a['vote_count'] ?? 0)
  const group = (kind: 'backdrops' | 'posters', languages: (string | null)[]): unknown[] =>
    list(images[kind])
      .filter((image) => languages.includes((image['iso_639_1'] as string | null) ?? null))
      .sort(byVotes)
      .map((image) => image['file_path'])
  const paths = [
    ...group('backdrops', [null]),
    ...group('posters', [null]),
    details['backdrop_path'],
    ...group('posters', ['cs', 'en']),
    details['poster_path'],
    ...group('backdrops', ['cs', 'en'])
  ].filter(isTmdbImagePath)
  return [...new Set(paths)].slice(0, MAX_ARTWORK)
}

/** Slova, která v názvu kanálu nic neříkají o pořadu („Bing Česky“, „Peppa Pig - Official“). */
// \b v JavaScriptu nezná písmena s diakritikou – hranice slova přes \p{L}.
const CHANNEL_NOISE =
  /(?<![\p{L}\p{N}])(česky|cesky|čeština|cestina|cz|czech|sk|slovensky|english|en|official|oficiální|oficialni|channel|kanál|kanal|tv|pohádky|pohadky|pro děti|pro deti|celé díly|cele dily|kids)(?![\p{L}\p{N}])/giu

export function cleanChannel(channel: string): string {
  return channel
    .replace(CHANNEL_NOISE, ' ')
    .replace(/[|\-–—:_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Čím hledat pořad: název titulu, klíčová slova, očištěné názvy kanálů (bez opakování). */
export function searchQueries(title: StoredTitle, channels: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const query of [title.folder, ...title.keywords, ...channels.map(cleanChannel)]) {
    const key = normalizeTitle(query)
    if (key.length < 2 || seen.has(key)) continue
    seen.add(key)
    result.push(query)
  }
  return result.slice(0, 6)
}

const isKidsResult = (result: Json): boolean =>
  list(result['genre_ids']).some((genre) => KIDS_GENRES.has(Number(genre)))

interface KidsArtworkEvents {
  /** Titul má nové obrázky nebo jiný stav hledání. */
  changed: []
}

export interface KidsArtworkOptions {
  /** Klient TMDB; null = klíč TMDB není zadaný. */
  client: () => TmdbApi | null
  /** Kam ukládat vlastní obrázky titulů. */
  coverDir: string
  now?: () => number
}

/**
 * Přiřadí titulům dětské části pořad z TMDB a jeho obrázky, aby šel titul poznat na
 * první pohled. Běží na pozadí po každé změně knihovny; bez klíče TMDB nedělá nic.
 */
export class KidsArtwork extends EventEmitter<KidsArtworkEvents> {
  private running: Promise<void> | null = null
  private again = false
  /** Do kdy se po chybě nezkouší automaticky znovu. */
  private pausedUntil = 0

  constructor(
    private readonly repository: KidsRepository,
    private readonly options: KidsArtworkOptions
  ) {
    super()
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** Dohledá tituly, u kterých se ještě nehledalo; souběžná volání se spojí. */
  run({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (force) this.pausedUntil = 0
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
      if (this.now() < this.pausedUntil) return
      const client = this.options.client()
      if (!client) return
      for (const title of this.repository.titlesNeedingArtwork()) {
        try {
          await this.lookup(client, title)
        } catch (error) {
          // Bez sítě nebo s neplatným klíčem nemá smysl zkoušet další tituly.
          console.warn(`Obrázky pohádek z TMDB: ${(error as Error).message}`)
          this.pausedUntil = this.now() + RETRY_AFTER_MS
          return
        }
        this.emit('changed')
      }
    } while (this.again)
  }

  private async lookup(client: TmdbApi, title: StoredTitle): Promise<void> {
    const found = await this.find(
      client,
      searchQueries(title, this.repository.titleChannels(title.id))
    )
    // Mezitím mohl titul zmizet nebo ho rodič přiřadil ručně.
    if (this.repository.title(title.id)?.tmdb.status !== 'pending') return
    if (!found) {
      this.repository.setTmdb(
        title.id,
        { status: 'none', kind: null, id: null, name: null, year: null },
        []
      )
      return
    }
    await this.save(client, title.id, found, 'matched')
  }

  private async find(
    client: TmdbApi,
    queries: readonly string[]
  ): Promise<{ kind: 'tv' | 'movie'; id: number } | null> {
    for (const query of queries) {
      for (const kind of ['tv', 'movie'] as const) {
        const response =
          kind === 'tv' ? await client.searchTv(query) : await client.searchMovie(query)
        const results = list(response['results']).filter(isKidsResult)
        // Jediný dětský pořad se bere i bez shody názvu – TMDB hledá i v překladech
        // a zdrobnělinách („Krteček“ → „Krtek“).
        const best =
          pickBestMatch([query], null, toCandidates({ results })) ??
          (results.length === 1 ? { id: Number(results[0]!['id']) } : null)
        if (best) return { kind, id: best.id }
      }
    }
    return null
  }

  private async save(
    client: TmdbApi,
    titleId: number,
    match: { kind: 'tv' | 'movie'; id: number },
    status: 'matched' | 'manual'
  ): Promise<void> {
    const details = match.kind === 'tv' ? await client.tv(match.id) : await client.movie(match.id)
    this.repository.setTmdb(
      titleId,
      {
        status,
        kind: match.kind,
        id: match.id,
        name: str(details['name'] ?? details['title']),
        year: yearOf(details['first_air_date'] ?? details['release_date'])
      },
      pickArtwork(details)
    )
  }

  /** Hledání pořadu pro ruční výběr – podle názvu, nebo podle odkazu z themoviedb.org. */
  async search(query: string): Promise<KidsTmdbResult[]> {
    const client = this.options.client()
    if (!client) throw new Error('Nejdřív zadej klíč TMDB v Nastavení → Metadata.')
    const link = parseTmdbLink(query)
    if (link) {
      const details = link.kind === 'tv' ? await client.tv(link.id) : await client.movie(link.id)
      return [toResult(link.kind, { ...details, id: link.id })]
    }
    const [tv, movie] = await Promise.all([client.searchTv(query), client.searchMovie(query)])
    const results = [
      ...list(tv['results']).map((r) => ({ kind: 'tv' as const, r })),
      ...list(movie['results']).map((r) => ({ kind: 'movie' as const, r }))
    ]
    // Dětské pořady první, jinak v pořadí, jak je vrátilo TMDB.
    return results
      .map((item, index) => ({ ...item, order: (isKidsResult(item.r) ? 0 : 1000) + index }))
      .sort((a, b) => a.order - b.order)
      .slice(0, 12)
      .map(({ kind, r }) => toResult(kind, r))
  }

  /** Ruční výběr pořadu; null = obrázky z TMDB u titulu nepoužívat. */
  async choose(titleId: number, choice: KidsTmdbChoice): Promise<KidsManageResult> {
    const title = this.repository.title(titleId)
    if (!title) return { ok: false, message: 'Titul už neexistuje.' }
    try {
      if (choice === null) {
        this.repository.setTmdb(
          titleId,
          { status: 'off', kind: null, id: null, name: null, year: null },
          []
        )
      } else {
        const client = this.options.client()
        if (!client)
          return { ok: false, message: 'Nejdřív zadej klíč TMDB v Nastavení → Metadata.' }
        await this.save(client, titleId, choice, 'manual')
      }
      // Obrázek vybraný z původního pořadu už k titulu nepatří.
      if (title.coverImage?.startsWith('tmdb:')) this.repository.setCover(titleId, null)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    } finally {
      this.emit('changed')
    }
  }

  /** Vlastní obrázek titulu ze souboru – zkopíruje se k datům aplikace. */
  async setCustomCover(titleId: number, source: string): Promise<KidsManageResult> {
    if (!this.repository.title(titleId)) return { ok: false, message: 'Titul už neexistuje.' }
    const extension = extname(source).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(extension))
      return { ok: false, message: 'Vyber obrázek JPG, PNG nebo WebP.' }
    try {
      if ((await stat(source)).size > MAX_IMAGE_BYTES)
        return { ok: false, message: 'Obrázek je moc velký (víc než 20 MB).' }
      await mkdir(this.options.coverDir, { recursive: true })
      await this.removeCustomCovers(titleId)
      const target = join(this.options.coverDir, `title-${titleId}-${this.now()}${extension}`)
      await copyFile(source, target)
      this.repository.setCoverImage(titleId, `file:${target}`)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    } finally {
      this.emit('changed')
    }
  }

  /** Smaže uložené vlastní obrázky titulu (při výměně obrázku). */
  private async removeCustomCovers(titleId: number): Promise<void> {
    const prefix = `title-${titleId}-`
    for (const name of await readdir(this.options.coverDir).catch(() => []))
      if (name.startsWith(prefix)) await rm(join(this.options.coverDir, name), { force: true })
  }
}

function toResult(kind: 'tv' | 'movie', r: Json): KidsTmdbResult {
  const name = str(r['name'] ?? r['title']) ?? ''
  const original = str(r['original_name'] ?? r['original_title'])
  return {
    kind,
    id: Number(r['id']),
    name,
    originalName: original && original !== name ? original : null,
    year: yearOf(r['first_air_date'] ?? r['release_date']),
    posterUrl: imageUrl('w185', r['poster_path'])
  }
}
