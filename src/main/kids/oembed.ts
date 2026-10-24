import { youtubeVideoUrl } from '../../shared/kids'
import type { VideoInfo } from './ytdlp'

/** oEmbed odpovídá hned – když ne do 10 s, náhled raději načte yt-dlp. */
const OEMBED_TIMEOUT_MS = 10_000

/** Výstup služby oEmbed YouTube (název a kanál, délku nevrací). */
export function parseOembed(json: unknown): VideoInfo | null {
  if (typeof json !== 'object' || json === null) return null
  const info = json as Record<string, unknown>
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null
  const title = text(info['title'])
  if (!title) return null
  return { title, channel: text(info['author_name']), durationSec: null, entries: [] }
}

/**
 * Rychlé údaje o videu přes oEmbed YouTube (zlomek sekundy, bez spouštění yt-dlp).
 * Při chybě vrátí null – soukromá, věkově omezená nebo nevložitelná videa načte yt-dlp,
 * který navíc řekne proč.
 */
export async function fetchOembed(
  fetchImpl: typeof fetch,
  videoId: string
): Promise<VideoInfo | null> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeVideoUrl(videoId))}`
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) })
    if (!response.ok) return null
    return parseOembed(await response.json())
  } catch {
    return null
  }
}
