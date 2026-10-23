import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import {
  rankSubtitles,
  type OnlineDownloadResult,
  type OnlineSearchResult,
  type OnlineSubtitle,
  type OnlineSubtitlesCredentials,
  type OnlineSubtitlesStatus
} from '../../shared/onlineSubtitles'
import type { SettingsRepository } from '../settings/SettingsRepository'
import { prepareSubtitle, type ExternalSubtitle } from './externalSubtitles'
import { movieHash } from './movieHash'
import { OpenSubtitlesClient, OpenSubtitlesError, type SubtitleQuery } from './OpenSubtitlesClient'

const API_KEY = 'opensubtitles.apiKey'
const USERNAME = 'opensubtitles.username'
const PASSWORD = 'opensubtitles.password'

/** Co se ví o právě hraném souboru. */
export interface PlayingFile {
  path: string
  /** Film nebo díl z knihovny; null = soubor otevřený mimo knihovnu. */
  library: {
    kind: 'movie' | 'show'
    name: string
    year: number | null
    tmdbId: number | null
    imdbId: string | null
    season: number | null
    episode: number | null
  } | null
}

export interface OnlineSubtitlesDeps {
  settings: SettingsRepository
  fetchImpl: typeof fetch
  userAgent: string
  /** Kam uložit titulky, když do složky s filmem nejde zapisovat. */
  fallbackDir: string
  /** Kam převádět titulky v jiném kódování než UTF-8. */
  conversionDir: string
  /** Jiná adresa API (jen ve vývoji). */
  baseUrl?: string
}

const errorMessage = (error: unknown): string =>
  error instanceof OpenSubtitlesError
    ? error.message
    : `Nečekaná chyba: ${(error as Error).message}`

/** Hledání a stahování titulků z OpenSubtitles.com pro právě hraný soubor. */
export class OnlineSubtitlesService {
  /** Výsledky posledního hledání podle ID souboru titulků (jazyk pro název staženého souboru). */
  private lastResults = new Map<number, OnlineSubtitle>()

  constructor(private readonly deps: OnlineSubtitlesDeps) {}

  status(): OnlineSubtitlesStatus {
    const { settings } = this.deps
    return {
      configured: !!settings.getSecret(API_KEY),
      username: settings.get<string>(USERNAME) || null
    }
  }

  /** Ověří klíč (a přihlášení, je-li vyplněné) a uloží je šifrovaně. */
  async save(
    credentials: OnlineSubtitlesCredentials
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const apiKey = credentials.apiKey.trim()
    const username = credentials.username.trim()
    const password = credentials.password
    if (!apiKey) return { ok: false, message: 'Vlož klíč API z OpenSubtitles.com.' }
    const client = this.createClient(apiKey, username, password)
    try {
      if (username && password) await client.login()
      else await client.search({ languages: ['cs'], query: 'test' })
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
    const { settings } = this.deps
    settings.setSecret(API_KEY, apiKey)
    settings.set(USERNAME, username)
    if (username && password) settings.setSecret(PASSWORD, password)
    else settings.delete(PASSWORD)
    this.cached = null
    return { ok: true }
  }

  remove(): void {
    for (const key of [API_KEY, USERNAME, PASSWORD]) this.deps.settings.delete(key)
    this.cached = null
  }

  private cached: OpenSubtitlesClient | null = null

  private createClient(
    apiKey: string,
    username: string | null,
    password: string | null
  ): OpenSubtitlesClient {
    return new OpenSubtitlesClient({
      apiKey,
      username,
      password,
      userAgent: this.deps.userAgent,
      fetchImpl: this.deps.fetchImpl,
      baseUrl: this.deps.baseUrl
    })
  }

  private client(): OpenSubtitlesClient | null {
    if (this.cached) return this.cached
    const { settings } = this.deps
    const apiKey = settings.getSecret(API_KEY)
    if (!apiKey) return null
    this.cached = this.createClient(
      apiKey,
      settings.get<string>(USERNAME) ?? null,
      settings.getSecret(PASSWORD) ?? null
    )
    return this.cached
  }

  async search(file: PlayingFile, languages: string[]): Promise<OnlineSearchResult> {
    const client = this.client()
    if (!client) {
      return {
        ok: false,
        message: 'Nejdřív vlož klíč API z OpenSubtitles.com v Nastavení → Titulky.'
      }
    }
    const hash = await movieHash(file.path).catch(() => null)
    const library = file.library
    const query: SubtitleQuery = { languages, moviehash: hash }
    if (library?.kind === 'show') {
      Object.assign(query, {
        parentTmdbId: library.tmdbId,
        parentImdbId: library.imdbId,
        season: library.season,
        episode: library.episode
      })
    } else if (library) {
      Object.assign(query, { tmdbId: library.tmdbId, imdbId: library.imdbId })
    }
    if (!library?.tmdbId && !library?.imdbId) {
      Object.assign(query, {
        query: library?.name ?? basename(file.path, extname(file.path)),
        year: library?.year ?? null
      })
    }
    try {
      const subtitles = rankSubtitles(await client.search(query), languages)
      this.lastResults = new Map(subtitles.map((s) => [s.fileId, s]))
      const label = library
        ? `${library.name}${library.kind === 'show' && library.season !== null ? ` S${String(library.season).padStart(2, '0')}E${String(library.episode ?? 0).padStart(2, '0')}` : ''}`
        : basename(file.path)
      return { ok: true, subtitles, query: label }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  }

  /**
   * Stáhne titulky a uloží je vedle filmu („Film.cs.srt“), aby se příště načetly samy;
   * když tam zapisovat nejde (síť jen pro čtení), uloží je do dat aplikace.
   */
  async download(
    fileId: number,
    videoPath: string
  ): Promise<{ result: OnlineDownloadResult; subtitle: ExternalSubtitle | null }> {
    const client = this.client()
    if (!client) {
      return { result: { ok: false, message: 'Chybí klíč API OpenSubtitles.' }, subtitle: null }
    }
    let downloaded: Awaited<ReturnType<OpenSubtitlesClient['download']>>
    try {
      downloaded = await client.download(fileId)
    } catch (error) {
      return { result: { ok: false, message: errorMessage(error) }, subtitle: null }
    }
    const language = this.lastResults.get(fileId)?.language
    const safeLanguage = language && /^[a-z]{2}(-[a-z]{2})?$/.test(language) ? language : 'xx'
    const base = basename(videoPath, extname(videoPath))
    const name = (n: number): string => `${base}.${safeLanguage}${n > 1 ? `.${n}` : ''}.srt`

    let saved: string | null = null
    let savedTo: 'video-folder' | 'app-data' = 'video-folder'
    for (let n = 1; n <= 9 && !saved; n++) {
      const target = join(dirname(videoPath), name(n))
      try {
        await writeFile(target, downloaded.data, { flag: 'wx' })
        saved = target
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') break
      }
    }
    if (!saved) {
      savedTo = 'app-data'
      await mkdir(this.deps.fallbackDir, { recursive: true })
      saved = join(this.deps.fallbackDir, `${fileId}-${name(1)}`)
      await writeFile(saved, downloaded.data)
    }
    const subtitle = await prepareSubtitle(saved, videoPath, this.deps.conversionDir)
    return {
      result: { ok: true, savedTo, fileName: basename(saved), remaining: downloaded.remaining },
      subtitle: { ...subtitle, language: subtitle.language ?? language ?? null }
    }
  }
}
