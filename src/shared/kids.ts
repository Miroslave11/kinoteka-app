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
  /** Pohádky v pořadí, jak přibyly (= pořadí přehrávání „další pohádka“). */
  videos: KidsVideo[]
  favorite: boolean
}

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
}

export const DEFAULT_KIDS_SETTINGS: KidsSettings = { theme: 'obloha', autoplayNext: true }

/** Ověří nastavení z okna; neznámé hodnoty nahradí výchozími. */
export function parseKidsSettings(value: unknown): KidsSettings {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const theme = KIDS_THEMES.find((t) => t.id === input['theme'])?.id
  return {
    theme: theme ?? DEFAULT_KIDS_SETTINGS.theme,
    autoplayNext:
      typeof input['autoplayNext'] === 'boolean'
        ? input['autoplayNext']
        : DEFAULT_KIDS_SETTINGS.autoplayNext
  }
}

export interface KidsStatus {
  /** Složka s dětskými videi. */
  folder: string
  /** Verze staženého yt-dlp; null = zatím nestažený (stáhne se při prvním stahování). */
  ytDlpVersion: string | null
  busy: boolean
}

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']
const VIDEO_ID = /^[\w-]{11}$/

/**
 * Odkaz na jedno video z YouTube převede na kanonickou adresu
 * (`https://www.youtube.com/watch?v=…`); cokoli jiného vrátí null.
 */
export function parseYoutubeUrl(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (YOUTUBE_HOSTS.includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const match = /^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)
      id = match?.[1] ?? null
    }
  }
  return id && VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
}
