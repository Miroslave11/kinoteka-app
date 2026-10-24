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
    }
  | { ok: false; message: string }

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
