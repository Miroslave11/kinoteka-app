import { parseSearchResponse, type OnlineSubtitle } from '../../shared/onlineSubtitles'

export const OPENSUBTITLES_API = 'https://api.opensubtitles.com/api/v1'
/** Token platí 24 h; obnovuje se s rezervou. */
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000

export class OpenSubtitlesError extends Error {}

/** Co hledat – co víc se ví, tím přesnější výsledky. */
export interface SubtitleQuery {
  languages: string[]
  moviehash?: string | null
  tmdbId?: number | null
  imdbId?: string | null
  /** Díl seriálu: ID seriálu a čísla série a dílu. */
  parentTmdbId?: number | null
  parentImdbId?: string | null
  season?: number | null
  episode?: number | null
  /** Náhradní hledání podle názvu, když ID chybí. */
  query?: string | null
  year?: number | null
}

const imdbNumber = (id: string | null | undefined): number | null => {
  const match = /^tt0*(\d+)$/.exec(id ?? '')
  return match ? Number(match[1]) : null
}

/**
 * Parametry hledání. API chce klíče seřazené abecedně a hodnoty malými písmeny
 * (jinak přesměrovává), prázdné hodnoty vynechat.
 */
export function searchParams(query: SubtitleQuery): URLSearchParams {
  const values: Record<string, string | number | null | undefined> = {
    episode_number: query.season != null ? query.episode : null,
    imdb_id: query.parentTmdbId || query.parentImdbId ? null : imdbNumber(query.imdbId),
    languages: query.languages.length > 0 ? query.languages.join(',').toLowerCase() : null,
    moviehash: query.moviehash,
    parent_imdb_id: query.parentTmdbId ? null : imdbNumber(query.parentImdbId),
    parent_tmdb_id: query.parentTmdbId,
    query:
      query.tmdbId || query.imdbId || query.parentTmdbId || query.parentImdbId
        ? null
        : query.query?.toLowerCase(),
    season_number: query.season,
    tmdb_id: query.parentTmdbId || query.parentImdbId ? null : query.tmdbId,
    year: query.tmdbId || query.imdbId ? null : query.year
  }
  const params = new URLSearchParams()
  for (const key of Object.keys(values).sort()) {
    const value = values[key]
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
  }
  return params
}

export interface OpenSubtitlesOptions {
  apiKey: string
  username?: string | null
  password?: string | null
  userAgent: string
  fetchImpl: typeof fetch
  /** Jiná adresa API (jen ve vývoji – falešný server). */
  baseUrl?: string
  now?: () => number
}

/** Klient REST API OpenSubtitles.com (hledání a stažení titulků). */
export class OpenSubtitlesClient {
  private token: { value: string; expires: number } | null = null

  constructor(private readonly options: OpenSubtitlesOptions) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Api-Key': this.options.apiKey,
      'User-Agent': this.options.userAgent,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extra
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response
    try {
      response = await this.options.fetchImpl(
        `${this.options.baseUrl ?? OPENSUBTITLES_API}${path}`,
        init
      )
    } catch (error) {
      throw new OpenSubtitlesError(
        `OpenSubtitles.com není dostupné (${(error as Error).message}). Zkontroluj připojení.`
      )
    }
    if (response.ok) return response.json()
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    const message = typeof body['message'] === 'string' ? body['message'] : ''
    switch (response.status) {
      case 401:
        throw new OpenSubtitlesError(
          path === '/login'
            ? 'Přihlášení k OpenSubtitles se nepovedlo – zkontroluj jméno a heslo (jméno, ne e-mail).'
            : 'OpenSubtitles odmítlo klíč API – zkontroluj ho v Nastavení → Titulky.'
        )
      case 403:
        throw new OpenSubtitlesError(
          'OpenSubtitles odmítlo klíč API – zkontroluj ho v Nastavení → Titulky.'
        )
      case 406:
        throw new OpenSubtitlesError(
          `Dnešní limit stažení je vyčerpaný${message ? ` (${message})` : ''}. Přihlášení v nastavení limit zvýší.`
        )
      case 429:
        throw new OpenSubtitlesError('Příliš mnoho požadavků na OpenSubtitles – zkus to za chvíli.')
      default:
        throw new OpenSubtitlesError(
          `OpenSubtitles vrátilo chybu ${response.status}${message ? `: ${message}` : ''}.`
        )
    }
  }

  /** Přihlásí účet (vyšší denní limit). Bez jména a hesla vrací null – stahuje se bez přihlášení. */
  async login(): Promise<string | null> {
    const { username, password } = this.options
    if (!username || !password) return null
    if (this.token && this.token.expires > this.now()) return this.token.value
    const json = (await this.request('/login', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ username, password })
    })) as Record<string, unknown>
    if (typeof json['token'] !== 'string') {
      throw new OpenSubtitlesError('OpenSubtitles nevrátilo přihlašovací token.')
    }
    this.token = { value: json['token'], expires: this.now() + TOKEN_TTL_MS }
    return this.token.value
  }

  async search(query: SubtitleQuery): Promise<OnlineSubtitle[]> {
    const json = await this.request(`/subtitles?${searchParams(query).toString()}`, {
      headers: this.headers()
    })
    return parseSearchResponse(json)
  }

  /** Stáhne soubor titulků (SRT). */
  async download(
    fileId: number
  ): Promise<{ data: Buffer; fileName: string; remaining: number | null }> {
    const token = await this.login()
    const json = (await this.request('/download', {
      method: 'POST',
      headers: this.headers(token ? { Authorization: `Bearer ${token}` } : {}),
      body: JSON.stringify({ file_id: fileId, sub_format: 'srt' })
    })) as Record<string, unknown>
    if (typeof json['link'] !== 'string') {
      throw new OpenSubtitlesError('OpenSubtitles nevrátilo odkaz ke stažení.')
    }
    let response: Response
    try {
      response = await this.options.fetchImpl(json['link'])
    } catch (error) {
      throw new OpenSubtitlesError(`Stažení titulků selhalo (${(error as Error).message}).`)
    }
    if (!response.ok)
      throw new OpenSubtitlesError(`Stažení titulků selhalo (HTTP ${response.status}).`)
    return {
      data: Buffer.from(await response.arrayBuffer()),
      fileName: typeof json['file_name'] === 'string' ? json['file_name'] : `${fileId}.srt`,
      remaining: typeof json['remaining'] === 'number' ? json['remaining'] : null
    }
  }
}
