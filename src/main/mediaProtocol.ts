import { protocol } from 'electron'
import { open, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { ImageCache } from './metadata/ImageCache'

export const MEDIA_SCHEME = 'kinoteka-media'

/** Musí proběhnout před `app.whenReady()`. `stream` dovolí přehrávat video po částech. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** „bytes=100-199“ → { start: 100, end: 199 }; neplatný nebo mimo soubor → null. */
export function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '')
  if (!match || (!match[1] && !match[2]) || size === 0) return null
  let start: number
  let end: number
  if (!match[1]) {
    // „bytes=-500“ = posledních 500 bajtů
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  }
  return start <= end && start < size ? { start, end } : null
}

const CLIP_NAME = /^\d+-\d+\.mp4$/

const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm'
}

/** Soubor po částech (Range) – video a zvuk v okně jde přetáčet a načítat průběžně. */
async function serveFile(
  file: string,
  contentType: string,
  rangeHeader: string | null
): Promise<Response> {
  let size: number
  try {
    size = (await stat(file)).size
  } catch {
    return new Response(null, { status: 404 })
  }
  const range = parseRange(rangeHeader, size)
  const start = range?.start ?? 0
  const end = range?.end ?? size - 1
  const handle = await open(file, 'r')
  try {
    const data = new Uint8Array(end - start + 1)
    await handle.read(data, 0, data.length, start)
    return new Response(data, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(data.length),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  } finally {
    await handle.close()
  }
}

function serveClip(clipsDir: string, name: string, rangeHeader: string | null): Promise<Response> {
  if (!CLIP_NAME.test(name)) return Promise.resolve(new Response(null, { status: 404 }))
  return serveFile(join(clipsDir, name), 'video/mp4', rangeHeader)
}

/** Ústřední melodie titulu podle id – cestu zná jen hlavní proces. */
async function serveTheme(
  themePath: (titleId: number) => Promise<string | null>,
  pathname: string,
  rangeHeader: string | null
): Promise<Response> {
  const match = /^\/(\d+)$/.exec(pathname)
  const file = match ? await themePath(Number(match[1])) : null
  const type = file && AUDIO_TYPES[extname(file).toLowerCase()]
  if (!file || !type) return new Response(null, { status: 404 })
  return serveFile(file, type, rangeHeader)
}

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/** Cesty k obrázkům dětské části – zná je jen hlavní proces, okno posílá jen id. */
export interface KidsImages {
  video: (videoId: number) => string | null
  /** Vlastní obrázek titulu vybraný rodičem. */
  title: (titleId: number) => string | null
  /** Obrázek videa z části YT videa. */
  ytVideo: (videoId: number) => string | null
}

/** Obrázek dětského videa nebo titulu (nebo YT videa) podle id. */
async function serveKidsImage(
  kidsImages: KidsImages,
  pathname: string,
  host: 'kids' | 'yt' = 'kids'
): Promise<Response> {
  const match = /^\/(video|title)\/(\d+)$/.exec(pathname)
  const pick =
    host === 'yt'
      ? match?.[1] === 'video'
        ? kidsImages.ytVideo
        : null
      : match
        ? kidsImages[match[1] as 'video' | 'title']
        : null
  const file = match && pick ? pick(Number(match[2])) : null
  const type = file && IMAGE_TYPES[extname(file).toLowerCase()]
  if (!file || !type) return new Response(null, { status: 404 })
  try {
    return new Response(new Uint8Array(await readFile(file)), {
      headers: { 'Content-Type': type, 'Cache-Control': 'max-age=86400' }
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

/** Náhledy z YouTube (náhled odkazu a fronta stahování) – pár posledních v paměti. */
const youtubeThumbnails = new Map<string, Uint8Array>()
const YOUTUBE_THUMBNAIL_CACHE = 100

async function serveYoutubeThumbnail(fetchImpl: typeof fetch, pathname: string): Promise<Response> {
  const id = pathname.slice(1)
  if (!/^[\w-]{11}$/.test(id)) return new Response(null, { status: 404 })
  let data = youtubeThumbnails.get(id)
  if (!data) {
    try {
      const response = await fetchImpl(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`)
      if (!response.ok) return new Response(null, { status: 404 })
      data = new Uint8Array(await response.arrayBuffer())
    } catch {
      return new Response(null, { status: 404 })
    }
    if (youtubeThumbnails.size >= YOUTUBE_THUMBNAIL_CACHE)
      youtubeThumbnails.delete(youtubeThumbnails.keys().next().value!)
    youtubeThumbnails.set(id, data)
  }
  return new Response(data, { headers: { 'Content-Type': 'image/jpeg' } })
}

/**
 * kinoteka-media://tmdb/w500/abc.jpg → obrázek z cache (případně stažený z TMDB)
 * kinoteka-media://clips/12-0.mp4   → klip na pozadí
 * kinoteka-media://kids/video/7     → obrázek dětského videa
 * kinoteka-media://kids/title/3     → vlastní obrázek dětského titulu
 * kinoteka-media://yt/video/7       → obrázek YT videa
 * kinoteka-media://ytthumb/<id>     → náhled videa z YouTube (před stažením)
 * kinoteka-media://theme/12         → ústřední melodie titulu
 */
export function handleMediaProtocol(
  images: ImageCache,
  clipsDir: string,
  kidsImages: KidsImages,
  fetchImpl: typeof fetch,
  themePath: (titleId: number) => Promise<string | null>
): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname === 'clips') {
      return serveClip(clipsDir, url.pathname.slice(1), request.headers.get('Range'))
    }
    if (url.hostname === 'theme') {
      return serveTheme(themePath, url.pathname, request.headers.get('Range'))
    }
    if (url.hostname === 'kids') return serveKidsImage(kidsImages, url.pathname)
    if (url.hostname === 'yt') return serveKidsImage(kidsImages, url.pathname, 'yt')
    if (url.hostname === 'ytthumb') return serveYoutubeThumbnail(fetchImpl, url.pathname)
    if (url.hostname !== 'tmdb') return new Response(null, { status: 404 })
    const image = await images.get(url.pathname)
    if (!image) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(image.data), {
      headers: { 'Content-Type': image.contentType, 'Cache-Control': 'max-age=31536000, immutable' }
    })
  })
}
