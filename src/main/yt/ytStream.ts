import type { KidsQuality } from '../../shared/kids'
import { baseArgs, formatFor } from '../kids/ytdlp'

/**
 * Přehrávání videa z YouTube bez stažení: yt-dlp zjistí adresy obrazu a zvuku (bez stahování)
 * a mpv je přehraje přímo ze sítě. Obraz a zvuk jsou na YouTube zvlášť – spojí je EDL
 * („edl://…;!new_stream;…“), stejně jako to dělá vestavěný doplněk mpv pro YouTube.
 */

/** Argumenty yt-dlp: jen údaje o videu a vybraných formátech (s adresami), nic se nestahuje. */
export function buildStreamArgs(url: string, nodePath: string, quality: KidsQuality): string[] {
  return [
    ...baseArgs(nodePath),
    '-J',
    '--no-warnings',
    '--no-playlist',
    '-f',
    formatFor(quality),
    url
  ]
}

export interface YtStream {
  /** Adresa obrazu (nebo obrazu se zvukem u spojeného formátu). */
  video: string
  /** Adresa zvuku; null = formát už zvuk obsahuje. */
  audio: string | null
  /** Hlavičky, se kterými yt-dlp adresy získal (User-Agent…) – mpv je musí poslat stejné. */
  headers: Record<string, string>
  title: string | null
  durationSec: number | null
  /** Kdy adresy přestanou platit (ms od 1970); null = neznámo. */
  expiresAt: number | null
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const httpUrl = (value: unknown): string | null => {
  const url = text(value)
  return url && /^https?:\/\//i.test(url) ? url : null
}

function headersOf(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      // Hlavička s novým řádkem by rozbila volbu mpv.
      (entry): entry is [string, string] => typeof entry[1] === 'string' && !/[\r\n]/.test(entry[1])
    )
  )
}

/** Platnost adresy z parametru `expire` (YouTube ji dává v sekundách). */
function expiryOf(url: string): number | null {
  try {
    const expire = Number(new URL(url).searchParams.get('expire'))
    return Number.isFinite(expire) && expire > 0 ? expire * 1000 : null
  } catch {
    return null
  }
}

/** Výstup `yt-dlp -J -f …`: obraz a zvuk zvlášť (requested_formats), nebo jeden spojený formát. */
export function parseStream(json: unknown): YtStream | null {
  if (typeof json !== 'object' || json === null) return null
  const info = json as Record<string, unknown>
  const requested = Array.isArray(info['requested_formats'])
    ? (info['requested_formats'] as Record<string, unknown>[])
    : []
  const isAudioOnly = (f: Record<string, unknown>): boolean =>
    f['vcodec'] === 'none' && f['acodec'] !== 'none'
  // Obraz a zvuk zvlášť (requested_formats), jinak jeden spojený formát v samotném výpisu.
  const videoFormat =
    requested.length > 0 ? (requested.find((f) => !isAudioOnly(f)) ?? requested[0]!) : info
  const audioFormat = requested.find((f) => f !== videoFormat && isAudioOnly(f))
  const video = httpUrl(videoFormat['url'])
  const audio = audioFormat ? httpUrl(audioFormat['url']) : null
  const headers = headersOf(videoFormat['http_headers'])
  if (!video) return null
  const expiries = [video, audio].flatMap((url) => {
    const expiry = url ? expiryOf(url) : null
    return expiry === null ? [] : [expiry]
  })
  return {
    video,
    audio,
    headers,
    title: text(info['title']),
    durationSec: typeof info['duration'] === 'number' ? Math.round(info['duration']) : null,
    expiresAt: expiries.length > 0 ? Math.min(...expiries) : null
  }
}

/** Úsek EDL: „%délka%text“ – délka v bajtech, aby středníky a čárky v adrese nevadily. */
const edlPart = (url: string): string => `%${Buffer.byteLength(url, 'utf8')}%${url}`

/** Co předat mpv jako soubor: přímo adresu, nebo EDL s obrazem a zvukem jako dvěma proudy. */
export function mpvFileFor(stream: YtStream): string {
  if (!stream.audio) return stream.video
  return `edl://!no_clip;${edlPart(stream.video)};!new_stream;!no_clip;${edlPart(stream.audio)}`
}

/**
 * Volby mpv pro přehrávání ze sítě: stejné hlavičky jako yt-dlp, větší vyrovnávací paměť
 * a vypnutý vlastní doplněk mpv pro YouTube (adresy už má aplikace).
 */
export function mpvNetworkArgs(stream: Pick<YtStream, 'headers'>): string[] {
  const args = [
    '--ytdl=no',
    '--cache=yes',
    '--demuxer-max-bytes=200MiB',
    '--demuxer-readahead-secs=60'
  ]
  for (const [name, value] of Object.entries(stream.headers)) {
    if (name.toLowerCase() === 'user-agent') args.push(`--user-agent=${value}`)
    // „-append“ přidá jednu hlavičku celou (čárky v hodnotě nevadí).
    else args.push(`--http-header-fields-append=${name}: ${value}`)
  }
  return args
}

/** Jak dlouho nejvýš čekat, než YouTube čerstvou adresu začne vydávat. */
export const READY_TIMEOUT_MS = 12_000
const READY_POLL_MS = 300

export interface WaitOptions {
  /** HTTP stav odpovědi na první bajt adresy (výchozí přes fetch). */
  probe?: (url: string, headers: Record<string, string>) => Promise<number>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  timeoutMs?: number
}

const fetchProbe = async (url: string, headers: Record<string, string>): Promise<number> => {
  const response = await fetch(url, { headers: { ...headers, Range: 'bytes=0-0' } })
  await response.body?.cancel().catch(() => undefined)
  return response.status
}

/**
 * Počká, až adresy začnou platit. YouTube čerstvě vydanou adresu první 2–3 sekundy odmítá
 * (HTTP 403) – mpv by ji neotevřel a skončil. Jiná chyba než 403 se nečeká (pozná ji mpv).
 */
export async function waitUntilPlayable(
  stream: YtStream,
  options: WaitOptions = {}
): Promise<void> {
  const probe = options.probe ?? fetchProbe
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = options.now ?? Date.now
  const deadline = now() + (options.timeoutMs ?? READY_TIMEOUT_MS)
  for (const url of [stream.video, stream.audio]) {
    if (!url) continue
    for (;;) {
      let status: number
      try {
        status = await probe(url, stream.headers)
      } catch {
        return // Síť – rozhodne až mpv.
      }
      if (status !== 403 || now() >= deadline) break
      await sleep(READY_POLL_MS)
    }
  }
}

/** Adresy platí několik hodin; do 15 minut před vypršením se použijí znovu. */
export const STREAM_REUSE_MARGIN_MS = 15 * 60 * 1000
/** Bez údaje o platnosti se adresy drží nejvýš hodinu. */
const DEFAULT_LIFETIME_MS = 60 * 60 * 1000

/**
 * Zjišťování adres s mezipamětí: opakované spuštění nebo pokračování videa nečeká znovu
 * na yt-dlp. Souběžné dotazy na stejné video se spojí.
 */
export class YtStreamResolver {
  private readonly cache = new Map<string, { stream: YtStream; validUntil: number }>()
  private readonly pending = new Map<string, Promise<YtStream>>()

  constructor(
    private readonly lookup: (youtubeId: string, quality: KidsQuality) => Promise<unknown>,
    private readonly now: () => number = Date.now,
    /** Čekání, než čerstvé adresy začnou platit (viz {@link waitUntilPlayable}). */
    private readonly ready: (stream: YtStream) => Promise<void> = async () => undefined
  ) {}

  resolve(youtubeId: string, quality: KidsQuality): Promise<YtStream> {
    const key = `${youtubeId}/${quality}`
    const cached = this.cache.get(key)
    if (cached && cached.validUntil > this.now()) return Promise.resolve(cached.stream)
    let running = this.pending.get(key)
    if (!running) {
      running = this.lookup(youtubeId, quality)
        .then(async (json) => {
          const stream = parseStream(json)
          if (!stream) throw new Error('YouTube nevrátil adresu videa. Zkus to prosím znovu.')
          await this.ready(stream)
          const expires = stream.expiresAt ?? this.now() + DEFAULT_LIFETIME_MS
          this.cache.set(key, { stream, validUntil: expires - STREAM_REUSE_MARGIN_MS })
          return stream
        })
        .finally(() => this.pending.delete(key))
      this.pending.set(key, running)
    }
    return running
  }

  /** Adresy přestaly fungovat (mpv je neotevřel) – příště se zjistí znovu. */
  forget(youtubeId: string): void {
    for (const key of this.cache.keys()) if (key.startsWith(`${youtubeId}/`)) this.cache.delete(key)
  }
}
