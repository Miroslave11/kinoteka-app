export const TMDB_API_URL = 'https://api.themoviedb.org/3'
export const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p'

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
  }
}

export interface TmdbClientOptions {
  /** API klíč (v3) nebo „API Read Access Token“ (v4, začíná „eyJ“). */
  credential: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  /** Nejvýš tolik požadavků najednou (TMDB omezuje rychlost). */
  maxConcurrent?: number
}

type Params = Record<string, string | number | undefined>
type Json = Record<string, unknown>

const MAX_RETRIES = 3

/** Tenký klient TMDB API v3 s omezením souběžnosti a opakováním při HTTP 429. */
export class TmdbClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly maxConcurrent: number
  private active = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly options: TmdbClientOptions) {
    this.baseUrl = (options.baseUrl ?? TMDB_API_URL).replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.maxConcurrent = options.maxConcurrent ?? 4
  }

  /** Ověří klíč. false = TMDB klíč odmítl; chyba sítě vyhodí výjimku. */
  async validate(): Promise<boolean> {
    try {
      await this.get('/authentication')
      return true
    } catch (error) {
      if (error instanceof TmdbError && error.status === 401) return false
      throw error
    }
  }

  searchMovie(query: string, year?: number | null): Promise<Json> {
    return this.get('/search/movie', { query, year: year ?? undefined, language: 'cs-CZ' })
  }

  searchTv(query: string, year?: number | null): Promise<Json> {
    return this.get('/search/tv', {
      query,
      first_air_date_year: year ?? undefined,
      language: 'cs-CZ'
    })
  }

  movie(id: number, language = 'cs-CZ'): Promise<Json> {
    return this.get(`/movie/${id}`, {
      language,
      append_to_response: 'credits,images,videos,external_ids',
      include_image_language: 'cs,en,null',
      include_video_language: 'cs,en'
    })
  }

  tv(id: number, language = 'cs-CZ'): Promise<Json> {
    return this.get(`/tv/${id}`, {
      language,
      append_to_response: 'credits,images,videos,external_ids',
      include_image_language: 'cs,en,null',
      include_video_language: 'cs,en'
    })
  }

  tvSeason(id: number, season: number, language = 'cs-CZ'): Promise<Json> {
    return this.get(`/tv/${id}/season/${season}`, { language })
  }

  private async get(path: string, params: Params = {}): Promise<Json> {
    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    // Token v4 je JWT a posílá se v hlavičce, klíč v3 jako parametr.
    if (this.options.credential.startsWith('eyJ')) {
      headers['Authorization'] = `Bearer ${this.options.credential}`
    } else {
      url.searchParams.set('api_key', this.options.credential)
    }

    await this.acquire()
    try {
      for (let attempt = 0; ; attempt++) {
        let response: Response
        try {
          response = await this.fetchImpl(url, { headers })
        } catch (error) {
          throw new TmdbError(`TMDB není dostupné: ${(error as Error).message}`)
        }
        if (response.status === 429 && attempt < MAX_RETRIES) {
          const wait = Number(response.headers.get('Retry-After')) || 1 + attempt
          await new Promise((resolve) => setTimeout(resolve, wait * 1000))
          continue
        }
        if (!response.ok) {
          const message =
            response.status === 401
              ? 'Neplatný klíč TMDB'
              : `TMDB vrátilo chybu HTTP ${response.status}`
          throw new TmdbError(message, response.status)
        }
        return (await response.json()) as Json
      }
    } finally {
      this.release()
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.active++
  }

  private release(): void {
    this.active--
    this.waiting.shift()?.()
  }
}
