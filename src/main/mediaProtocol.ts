import { protocol } from 'electron'
import { open, stat } from 'node:fs/promises'
import { join } from 'node:path'
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

async function serveClip(
  clipsDir: string,
  name: string,
  rangeHeader: string | null
): Promise<Response> {
  if (!CLIP_NAME.test(name)) return new Response(null, { status: 404 })
  const file = join(clipsDir, name)
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
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(data.length),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  } finally {
    await handle.close()
  }
}

/**
 * kinoteka-media://tmdb/w500/abc.jpg → obrázek z cache (případně stažený z TMDB)
 * kinoteka-media://clips/12-0.mp4   → klip na pozadí
 */
export function handleMediaProtocol(images: ImageCache, clipsDir: string): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname === 'clips') {
      return serveClip(clipsDir, url.pathname.slice(1), request.headers.get('Range'))
    }
    if (url.hostname !== 'tmdb') return new Response(null, { status: 404 })
    const image = await images.get(url.pathname)
    if (!image) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(image.data), {
      headers: { 'Content-Type': image.contentType, 'Cache-Control': 'max-age=31536000, immutable' }
    })
  })
}
