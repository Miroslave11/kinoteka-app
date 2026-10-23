/** Titulky nalezené na OpenSubtitles.com. */
export interface OnlineSubtitle {
  /** ID souboru pro stažení (`file_id`). */
  fileId: number
  /** ISO 639-1 („cs“, „en“…). */
  language: string
  /** Název vydání, ke kterému titulky patří („Movie.2020.1080p.WEB-DL…“). */
  release: string
  downloads: number
  /** Titulky sedí přesně na tento soubor (shoda otisku souboru). */
  hashMatch: boolean
  /** Od ověřeného autora. */
  trusted: boolean
  hearingImpaired: boolean
  /** Přeložené strojově nebo AI – obvykle horší kvalita. */
  machineTranslated: boolean
}

/** Stav nastavení OpenSubtitles pro okno. */
export interface OnlineSubtitlesStatus {
  configured: boolean
  /** Přihlášený účet (vyšší denní limit stažení); null = bez přihlášení. */
  username: string | null
}

export interface OnlineSubtitlesCredentials {
  apiKey: string
  username: string
  password: string
}

export type OnlineSearchResult =
  { ok: true; subtitles: OnlineSubtitle[]; query: string } | { ok: false; message: string }

export type OnlineDownloadResult =
  | { ok: true; savedTo: 'video-folder' | 'app-data'; fileName: string; remaining: number | null }
  | { ok: false; message: string }

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

/** Odpověď `GET /subtitles` → seznam titulků (jedna položka za soubor titulků). */
export function parseSearchResponse(json: unknown): OnlineSubtitle[] {
  const data = record(json)['data']
  if (!Array.isArray(data)) return []
  const result: OnlineSubtitle[] = []
  for (const item of data) {
    const attributes = record(record(item)['attributes'])
    const files = Array.isArray(attributes['files']) ? attributes['files'] : []
    const file = record(files[0])
    const fileId = Number(file['file_id'])
    if (!Number.isInteger(fileId) || fileId <= 0) continue
    result.push({
      fileId,
      language: typeof attributes['language'] === 'string' ? attributes['language'] : '',
      release:
        (typeof attributes['release'] === 'string' && attributes['release'].trim()) ||
        (typeof file['file_name'] === 'string' ? file['file_name'] : ''),
      downloads: Number(attributes['download_count'] ?? 0) || 0,
      hashMatch: attributes['moviehash_match'] === true,
      trusted: attributes['from_trusted'] === true,
      hearingImpaired: attributes['hearing_impaired'] === true,
      machineTranslated:
        attributes['machine_translated'] === true || attributes['ai_translated'] === true
    })
  }
  return result
}

/**
 * Pořadí nabídky: přesná shoda se souborem, preferovaný jazyk (v pořadí z nastavení),
 * lidský překlad, ověřený autor, počet stažení.
 */
export function rankSubtitles(subtitles: OnlineSubtitle[], languages: string[]): OnlineSubtitle[] {
  const languageRank = (language: string): number => {
    const index = languages.indexOf(language)
    return index < 0 ? languages.length : index
  }
  return [...subtitles].sort(
    (a, b) =>
      Number(b.hashMatch) - Number(a.hashMatch) ||
      languageRank(a.language) - languageRank(b.language) ||
      Number(a.machineTranslated) - Number(b.machineTranslated) ||
      Number(b.trusted) - Number(a.trusted) ||
      b.downloads - a.downloads
  )
}
