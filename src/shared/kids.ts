/** Dětská část – stahování videí z YouTube (yt-dlp). */

/**
 * tool     – stahuje se nebo aktualizuje yt-dlp
 * starting – yt-dlp zjišťuje údaje o videu
 * video    – stahuje se obraz (nebo celé video)
 * audio    – stahuje se zvuk
 * merging  – obraz a zvuk se spojují do mp4
 */
export type KidsDownloadPhase = 'tool' | 'starting' | 'video' | 'audio' | 'merging'

export interface KidsDownloadProgress {
  phase: KidsDownloadPhase
  /** 0–100 u právě stahované části; null = neznámé. */
  percent: number | null
  /** Bajty za sekundu; null = neznámé. */
  speed: number | null
  /** Zbývající sekundy; null = neznámé. */
  eta: number | null
}

export type KidsDownloadResult =
  | {
      ok: true
      title: string
      channel: string | null
      durationSec: number | null
      fileName: string
      /** Náhled videa jako data URL; null = YouTube náhled nedal. */
      thumbnail: string | null
      /** Video v knihovně Děti (po zařazení do titulu); null = nenašlo se. */
      videoId?: number | null
    }
  | { ok: false; message: string }

export interface KidsVideo {
  id: number
  titleId: number | null
  /** Název dílu bez názvu pořadu a dovětků („Bláto“). */
  name: string
  /** Původní název z YouTube. */
  originalName: string
  channel: string | null
  durationSec: number | null
  /** kinoteka-media://kids/… ; null = obrázek zatím není. */
  thumbnailUrl: string | null
  addedAt: string
  /** Rozkoukáno (0–1); null = nerozkoukané. */
  progress: number | null
  watched: boolean
  favorite: boolean
  /** Kdy se naposledy sledovala (řada „Dívat se dál“); null = ještě nikdy. */
  lastPlayedAt: string | null
}

/** Titul dětské části = podsložka ve složce Kids. */
export interface KidsTitle {
  /** null = videa přímo ve složce Kids, která se nepodařilo zařadit („Ostatní“). */
  id: number | null
  name: string
  keywords: string[]
  coverUrl: string | null
  /** Obrázek titulu z videa vybraný rodičem; null = nevybráno. */
  coverVideoId: number | null
  /**
   * Jiný obrázek vybraný rodičem: cesta obrázku z TMDB („/abc.jpg“), nebo „file“ = vlastní
   * obrázek ze souboru; null = nevybráno. Nic nevybráno = první obrázek z TMDB, jinak první video.
   */
  coverImage: string | null
  /** Obrázky pořadu z TMDB, nejvhodnější do kolečka první. */
  artwork: KidsArtwork[]
  /** Pořad na TMDB, podle kterého se obrázky hledají. */
  tmdb: KidsTmdbMatch
  /** Pohádky v pořadí, jak přibyly (= pořadí přehrávání „další pohádka“). */
  videos: KidsVideo[]
  favorite: boolean
}

/** Obrázek pořadu z TMDB. */
export interface KidsArtwork {
  /** Cesta na TMDB („/abc.jpg“) – tou se obrázek vybírá. */
  path: string
  url: string
}

/**
 * pending – ještě se nehledalo (nebo chybí klíč TMDB)
 * matched – nalezeno automaticky
 * manual  – vybral rodič
 * none    – nic se nenašlo
 * off     – rodič obrázky z TMDB vypnul
 */
export type KidsTmdbStatus = 'pending' | 'matched' | 'manual' | 'none' | 'off'

export interface KidsTmdbMatch {
  status: KidsTmdbStatus
  kind: 'tv' | 'movie' | null
  id: number | null
  name: string | null
  year: number | null
}

/** Výsledek hledání pořadu na TMDB (ruční výběr). */
export interface KidsTmdbResult {
  kind: 'tv' | 'movie'
  id: number
  name: string
  originalName: string | null
  year: number | null
  posterUrl: string | null
}

/** Ruční výběr pořadu: z výsledků hledání, nebo null = obrázky z TMDB nepoužívat. */
export type KidsTmdbChoice = { kind: 'tv' | 'movie'; id: number } | null

/** Odkaz na pořad z themoviedb.org („…/tv/69501-bing“) → druh a TMDB ID. */
export function parseTmdbLink(text: string): { kind: 'tv' | 'movie'; id: number } | null {
  const match = /themoviedb\.org\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(tv|movie)\/(\d{1,9})(?:\D|$)/.exec(
    text.trim()
  )
  return match ? { kind: match[1] as 'tv' | 'movie', id: Number(match[2]) } : null
}

/** Ověří ruční výběr pořadu z okna. */
export function parseTmdbChoice(value: unknown): KidsTmdbChoice | undefined {
  if (value === null) return null
  if (typeof value !== 'object') return undefined
  const input = value as Record<string, unknown>
  const id = input['id']
  if ((input['kind'] !== 'tv' && input['kind'] !== 'movie') || !Number.isInteger(id))
    return undefined
  return (id as number) > 0 ? { kind: input['kind'], id: id as number } : undefined
}

/** Cesta obrázku na TMDB – nic jiného (ochrana proti „../“). */
export const isTmdbImagePath = (value: unknown): value is string =>
  typeof value === 'string' && /^\/[\w-]+\.(jpg|jpeg|png|webp)$/i.test(value)

export interface KidsScanResult {
  titles: number
  videos: number
  /** Kolik videí z kořene složky se zařadilo (přesunulo) do titulů. */
  sorted: number
  /** Soubory, které se nepodařilo přesunout nebo přečíst. */
  errors: string[]
}

export const KIDS_THEMES = [
  { id: 'obloha', label: 'Obloha' },
  { id: 'louka', label: 'Louka' },
  { id: 'more', label: 'Moře' },
  { id: 'vesmir', label: 'Vesmír' },
  { id: 'jednorozci', label: 'Jednorožci' }
] as const

export type KidsTheme = (typeof KIDS_THEMES)[number]['id']

export interface KidsSettings {
  theme: KidsTheme
  /** Po konci pohádky se sama spustí další ze stejného titulu. */
  autoplayNext: boolean
  /** Kolik minut pohádek denně; null = bez limitu. */
  timeLimitMin: number | null
  /** Kinotéka se spustí rovnou v dětském režimu. */
  startInKids: boolean
  /** Odchod z dětského režimu jen přes rodičovskou bránu; jinak tlačítkem Odejít. */
  protectExit: boolean
  /** Rodičovská brána (PIN nebo příklad); vypnuto = část Pro rodiče i odchod volně. */
  parentGate: boolean
}

export const DEFAULT_KIDS_SETTINGS: KidsSettings = {
  theme: 'obloha',
  autoplayNext: true,
  timeLimitMin: null,
  startInKids: false,
  protectExit: false,
  parentGate: true
}

/** Nejdelší denní limit, který jde nastavit (10 hodin). */
export const MAX_TIME_LIMIT_MIN = 600

/** Ověří nastavení z okna; neznámé hodnoty nahradí výchozími. */
export function parseKidsSettings(value: unknown): KidsSettings {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const theme = KIDS_THEMES.find((t) => t.id === input['theme'])?.id
  const bool = (key: 'autoplayNext' | 'startInKids' | 'protectExit' | 'parentGate'): boolean =>
    typeof input[key] === 'boolean' ? input[key] : DEFAULT_KIDS_SETTINGS[key]
  const limit = input['timeLimitMin']
  return {
    theme: theme ?? DEFAULT_KIDS_SETTINGS.theme,
    autoplayNext: bool('autoplayNext'),
    timeLimitMin:
      Number.isInteger(limit) && (limit as number) > 0 && (limit as number) <= MAX_TIME_LIMIT_MIN
        ? (limit as number)
        : null,
    startInKids: bool('startInKids'),
    protectExit: bool('protectExit'),
    parentGate: bool('parentGate')
  }
}

/** Stav dětského režimu pro okno. */
export interface KidsMode {
  /** Okno je v dětském režimu – ven jen přes rodičovskou bránu. */
  locked: boolean
  /** Rodič prošel bránou (část Pro rodiče je otevřená). */
  parent: boolean
  hasPin: boolean
  /** Zbývající čas pohádek dnes v sekundách; null = bez limitu. */
  timeLeftSec: number | null
}

/** Otázka rodičovské brány: PIN, nebo příklad pro dospělé (když PIN není nastavený). */
export type KidsChallenge = { kind: 'pin' } | { kind: 'math'; question: string }

export type KidsUnlockResult = { ok: true } | { ok: false; message: string; retryAfterSec?: number }

/** PIN = 4 až 8 číslic. */
export const isValidPin = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4,8}$/.test(value)

export interface KidsStatus {
  /** Složka s dětskými videi. */
  folder: string
  /** Verze staženého yt-dlp; null = zatím nestažený (stáhne se při prvním stahování). */
  ytDlpVersion: string | null
  busy: boolean
}

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']
const VIDEO_ID = /^[\w-]{11}$/

const PLAYLIST_ID = /^[\w-]{10,64}$/

/** Odkaz z YouTube: video, playlist, nebo video v playlistu (`watch?v=…&list=…`). */
export interface YoutubeLink {
  videoId: string | null
  playlistId: string | null
}

export function parseYoutubeLink(text: string): YoutubeLink | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  let id: string | null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (YOUTUBE_HOSTS.includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const match = /^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)
      id = match?.[1] ?? null
    }
  } else return null
  const list = url.searchParams.get('list')
  const videoId = id && VIDEO_ID.test(id) ? id : null
  // Mixy („RD…“) jsou nekonečné, automaticky generované – stáhne se jen video.
  const playlistId = list && PLAYLIST_ID.test(list) && !list.startsWith('RD') ? list : null
  return videoId || playlistId ? { videoId, playlistId } : null
}

/** Nejvíc videí z jednoho playlistu (ochrana před omylem vloženým obřím seznamem). */
export const MAX_PLAYLIST_VIDEOS = 200

export const youtubeVideoUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`
export const youtubePlaylistUrl = (id: string): string =>
  `https://www.youtube.com/playlist?list=${id}`

/**
 * Odkaz na jedno video z YouTube převede na kanonickou adresu
 * (`https://www.youtube.com/watch?v=…`); cokoli jiného vrátí null.
 */
export function parseYoutubeUrl(text: string): string | null {
  const link = parseYoutubeLink(text)
  return link?.videoId ? youtubeVideoUrl(link.videoId) : null
}

export type KidsQuality = '1080' | '720'

/** Náhled odkazu před stažením (část Pro rodiče). */
export interface KidsPreview {
  /** Jedno video, nebo celý playlist (odkaz bez videa). */
  kind: 'video' | 'playlist'
  videoId: string | null
  title: string
  channel: string | null
  durationSec: number | null
  thumbnailUrl: string | null
  /** Playlist, ze kterého video je (nabídka „Celý playlist“), nebo stahovaný playlist. */
  playlist: { id: string; title: string; count: number } | null
  /** Navržený titul: existující (podle jména a klíčových slov), nebo nový podle kanálu. */
  suggestedTitle: string | null
  suggestedExisting: boolean
  /** Video už ve složce je (v tomto titulu). */
  alreadyIn: string | null
}

export type KidsPreviewResult = { ok: true; preview: KidsPreview } | { ok: false; message: string }

export interface KidsDownloadRequest {
  /** Stáhnout jen video, nebo celý playlist. */
  kind: 'video' | 'playlist'
  videoId: string | null
  playlistId: string | null
  /** Do kterého titulu (podsložky) uložit. */
  title: string
  quality: KidsQuality
}

/** Ověří požadavek na stažení z okna. */
export function parseDownloadRequest(value: unknown): KidsDownloadRequest | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const id = (key: string, pattern: RegExp): string | null =>
    typeof input[key] === 'string' && pattern.test(input[key]) ? input[key] : null
  const videoId = id('videoId', VIDEO_ID)
  const playlistId = id('playlistId', PLAYLIST_ID)
  const kind =
    input['kind'] === 'playlist' ? 'playlist' : input['kind'] === 'video' ? 'video' : null
  const title = typeof input['title'] === 'string' ? input['title'].trim() : ''
  const quality = input['quality'] === '720' ? '720' : input['quality'] === '1080' ? '1080' : null
  if (!kind || !quality || !title || title.length > 120) return null
  if (kind === 'video' ? !videoId : !playlistId) return null
  return { kind, videoId, playlistId, title, quality }
}

export type KidsQueueStatus = 'waiting' | 'downloading' | 'done' | 'skipped' | 'error'

export interface KidsQueueItem {
  id: number
  videoId: string
  name: string
  title: string
  status: KidsQueueStatus
  progress: KidsDownloadProgress | null
  /** Chyba nebo důvod přeskočení. */
  message: string | null
}

/** Obrázek videa z YouTube přes aplikaci (okno nesmí načítat cizí adresy). */
export const youtubeThumbnailUrl = (videoId: string): string =>
  `kinoteka-media://ytthumb/${videoId}`

// ---------- správa titulů (část Pro rodiče) ----------

export const MAX_KEYWORDS = 20
const MAX_KEYWORD_LENGTH = 40
const MAX_TITLE_NAME = 120

export type KidsManageAction =
  | { kind: 'create-title'; name: string }
  | { kind: 'rename-title'; titleId: number; name: string }
  | { kind: 'set-keywords'; titleId: number; keywords: string[] }
  /** videoId null = obrázek vybraný automaticky (z TMDB, jinak z prvního videa). */
  | { kind: 'set-cover'; titleId: number; videoId: number | null }
  /** Obrázek pořadu z TMDB (cesta z `artwork` titulu). */
  | { kind: 'set-cover-image'; titleId: number; image: string }
  /** Znovu dohledat pořad na TMDB podle názvu (zruší ruční výběr). */
  | { kind: 'tmdb-retry'; titleId: number }
  | { kind: 'trash-title'; titleId: number }
  | { kind: 'move-video'; videoId: number; titleId: number }
  | { kind: 'trash-video'; videoId: number }

export type KidsManageResult = { ok: true } | { ok: false; message: string }

/** Klíčová slova titulu: oříznutá, bez prázdných a opakovaných, nejvýš 20. */
export function cleanKeywords(values: readonly unknown[]): string[] {
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const keyword = value.trim().replace(/\s+/g, ' ').slice(0, MAX_KEYWORD_LENGTH)
    if (keyword && !result.some((k) => k.toLowerCase() === keyword.toLowerCase()))
      result.push(keyword)
  }
  return result.slice(0, MAX_KEYWORDS)
}

/** Ověří požadavek z okna (nic z něj se nepoužije bez kontroly). */
export function parseManageAction(value: unknown): KidsManageAction | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const id = (key: string): number | null =>
    Number.isInteger(input[key]) && (input[key] as number) > 0 ? (input[key] as number) : null
  const name =
    typeof input['name'] === 'string' && input['name'].trim().length <= MAX_TITLE_NAME
      ? input['name'].trim()
      : ''
  const titleId = id('titleId')
  const videoId = id('videoId')
  switch (input['kind']) {
    case 'create-title':
      return name ? { kind: 'create-title', name } : null
    case 'rename-title':
      return name && titleId ? { kind: 'rename-title', titleId, name } : null
    case 'set-keywords':
      return titleId && Array.isArray(input['keywords'])
        ? { kind: 'set-keywords', titleId, keywords: cleanKeywords(input['keywords']) }
        : null
    case 'set-cover':
      return titleId && (videoId || input['videoId'] === null)
        ? { kind: 'set-cover', titleId, videoId }
        : null
    case 'set-cover-image':
      return titleId && isTmdbImagePath(input['image'])
        ? { kind: 'set-cover-image', titleId, image: input['image'] }
        : null
    case 'tmdb-retry':
      return titleId ? { kind: 'tmdb-retry', titleId } : null
    case 'trash-title':
      return titleId ? { kind: 'trash-title', titleId } : null
    case 'move-video':
      return videoId && titleId ? { kind: 'move-video', videoId, titleId } : null
    case 'trash-video':
      return videoId ? { kind: 'trash-video', videoId } : null
    default:
      return null
  }
}
