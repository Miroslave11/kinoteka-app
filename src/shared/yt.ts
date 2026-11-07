/** Část YT videa: videa stažená z YouTube (hlavně klipy) roztříděná do kategorií podle obsahu. */

/** Záložní kategorie: hudba bez shody s jinou kategorií, a vše ostatní. */
export type YtCategoryRole = 'music' | 'other'

export interface YtVideoSummary {
  id: number
  name: string
  channel: string | null
  durationSec: number | null
  youtubeId: string | null
  /** Obrázek videa (z YouTube, jinak snímek z videa); null = zástupné pozadí. */
  thumbnailUrl: string | null
  addedAt: string
  /** Kolik je zhlédnuto (0–1) u rozkoukaného videa; null = není rozkoukané. */
  progress: number | null
  watched: boolean
  /** Kdy se naposledy hrálo (pro řadu Pokračovat). */
  lastPlayedAt: string | null
}

export interface YtCategory {
  /** null = videa ve složce, která ještě čekají na zařazení (údaje z YouTube). */
  id: number | null
  name: string
  keywords: string[]
  role: YtCategoryRole | null
  videos: YtVideoSummary[]
}

export interface YtStatus {
  folder: string
  /** Kvalita naposledy zvolená při stahování. */
  quality: '2160' | '1080' | '720'
  /** Kolik videí bez údajů ještě čeká na dotažení z YouTube. */
  pendingInfo: number
}

export interface YtScanResult {
  categories: number
  videos: number
  /** Kolik videí z kořene složky se zařadilo a přesunulo do kategorií. */
  sorted: number
  errors: string[]
}

export const MAX_YT_KEYWORDS = 80
const MAX_KEYWORD_LENGTH = 40
const MAX_CATEGORY_NAME = 80

export type YtManageAction =
  | { kind: 'create-category'; name: string }
  | { kind: 'set-keywords'; categoryId: number; keywords: string[] }
  /** Přejmenuje i podsložku. */
  | { kind: 'rename-category'; categoryId: number; name: string }
  /** Podsložka zmizí, její videa se znovu zařadí do ostatních kategorií. */
  | { kind: 'delete-category'; categoryId: number }
  /** Přesune video i s obrázkem a údaji do jiné kategorie. */
  | { kind: 'move-video'; videoId: number; categoryId: number }
  | { kind: 'trash-video'; videoId: number }

export type YtManageResult = { ok: true } | { ok: false; message: string }

/** Klíčová slova bez prázdných a opakovaných (bez ohledu na velikost písmen). */
export function cleanYtKeywords(values: readonly unknown[]): string[] {
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const keyword = value.trim().replace(/\s+/g, ' ').slice(0, MAX_KEYWORD_LENGTH)
    if (keyword && !result.some((k) => k.toLowerCase() === keyword.toLowerCase()))
      result.push(keyword)
  }
  return result.slice(0, MAX_YT_KEYWORDS)
}

/** Ověří požadavek z okna (nic z něj se nepoužije bez kontroly). */
export function parseYtManageAction(value: unknown): YtManageAction | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const id = (key: string): number | null =>
    Number.isInteger(input[key]) && (input[key] as number) > 0 ? (input[key] as number) : null
  const categoryId = id('categoryId')
  const videoId = id('videoId')
  const name =
    typeof input['name'] === 'string' && input['name'].trim().length <= MAX_CATEGORY_NAME
      ? input['name'].trim()
      : ''
  switch (input['kind']) {
    case 'create-category':
      return name ? { kind: 'create-category', name } : null
    case 'set-keywords':
      return categoryId && Array.isArray(input['keywords'])
        ? { kind: 'set-keywords', categoryId, keywords: cleanYtKeywords(input['keywords']) }
        : null
    case 'rename-category':
      return name && categoryId ? { kind: 'rename-category', categoryId, name } : null
    case 'delete-category':
      return categoryId ? { kind: 'delete-category', categoryId } : null
    case 'move-video':
      return videoId && categoryId ? { kind: 'move-video', videoId, categoryId } : null
    case 'trash-video':
      return videoId ? { kind: 'trash-video', videoId } : null
    default:
      return null
  }
}
