import type { KidsDownloadProgress, KidsQuality } from '../../shared/kids'

/**
 * Formát: nejlépe H.264 do zvolené výšky (přehraje cokoli a nezatíží procesor), jinak
 * nejlepší dostupný obraz do té výšky, jinak cokoli. Obraz a zvuk spojí ffmpeg do mp4.
 */
export const formatFor = (quality: KidsQuality): string =>
  `bv*[height<=${quality}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${quality}]+ba/b[height<=${quality}]/b`

export const YTDLP_FORMAT = formatFor('1080')

/** Společné volby: bez aktualizace a konfigurace, certifikáty Windows, JavaScript z Electronu. */
export const baseArgs = (nodePath: string): string[] => [
  '--no-update',
  '--ignore-config',
  '--encoding',
  'utf-8',
  // Certifikáty z Windows místo přibaleného seznamu – funguje i za antivirem, který kontroluje HTTPS.
  '--compat-options',
  'no-certifi',
  // Jen Node z Electronu (bez Deno a dalších programů, které by na počítači náhodou byly).
  '--no-js-runtimes',
  '--js-runtimes',
  `node:${nodePath}`
]

/** Údaje o videu nebo playlistu bez stahování (náhled v části Pro rodiče). */
export function buildInfoArgs(url: string, nodePath: string, playlist: boolean): string[] {
  return [
    ...baseArgs(nodePath),
    '-J',
    '--no-warnings',
    // Playlist stačí jako seznam videí (bez načítání každého z nich).
    ...(playlist ? ['--flat-playlist', '--yes-playlist'] : ['--no-playlist']),
    url
  ]
}

export interface VideoInfo {
  title: string
  channel: string | null
  durationSec: number | null
  /** Playlist: videa v něm (id, název). */
  entries: { id: string; title: string }[]
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** Výstup `yt-dlp -J` (video nebo playlist s --flat-playlist). */
export function parseInfo(json: unknown): VideoInfo | null {
  if (typeof json !== 'object' || json === null) return null
  const info = json as Record<string, unknown>
  const title = text(info['title'])
  if (!title) return null
  const entries = Array.isArray(info['entries'])
    ? (info['entries'] as Record<string, unknown>[])
        .map((entry) => ({ id: text(entry['id']) ?? '', title: text(entry['title']) ?? '' }))
        // Smazaná a soukromá videa v playlistu nemají název (nebo „[Private video]“).
        .filter(
          (entry) => /^[\w-]{11}$/.test(entry.id) && entry.title && !/^\[.*\]$/.test(entry.title)
        )
    : []
  return {
    title,
    channel: text(info['channel']) ?? text(info['uploader']),
    durationSec: typeof info['duration'] === 'number' ? Math.round(info['duration']) : null,
    entries
  }
}

/** Řádek průběhu, který si yt-dlp vypisuje podle šablony níže. */
const PROGRESS_PREFIX = '[KTK]'

export interface DownloadArgsOptions {
  url: string
  /** Kam uložit video, náhled a údaje. */
  folder: string
  /** Složka s ffmpeg.exe (spojení obrazu a zvuku, převod náhledu). */
  ffmpegDir: string
  /** Program, který yt-dlp použije jako JavaScript (Node) pro YouTube – Electron v režimu Node. */
  nodePath: string
  /** Soubor, do kterého yt-dlp zapíše cestu k hotovému videu. */
  pathFile: string
  quality?: KidsQuality
}

/** Nejdelší cesta, kterou yt-dlp (Python) na Windows zvládne zapsat (MAX_PATH bez koncové nuly). */
const MAX_PATH_CHARS = 259
/** Rezerva za příponami: ` [id]`, `.f137.mp4.part`, `.temp.mp4`, `.part-Frag123` a podobně. */
const FILE_NAME_RESERVE = 50
const MAX_TITLE_BYTES = 150
const MIN_TITLE_BYTES = 20

/**
 * Nejdelší název videa v souboru (v bajtech, což je pro znaky mimo ASCII i emoji vždy víc než
 * znaků v cestě Windows) tak, aby se celá cesta vešla do 260 znaků. Dlouhý název s emoji
 * ve složce se stejně dlouhým názvem jinak skončí chybou „No such file or directory“.
 */
export function titleBytesFor(folder: string): number {
  const room = MAX_PATH_CHARS - folder.length - 1 - FILE_NAME_RESERVE
  return Math.max(MIN_TITLE_BYTES, Math.min(MAX_TITLE_BYTES, room))
}

export function buildDownloadArgs(options: DownloadArgsOptions): string[] {
  return [
    ...baseArgs(options.nodePath),
    '--ffmpeg-location',
    options.ffmpegDir,
    '--no-playlist',
    '-f',
    formatFor(options.quality ?? '1080'),
    '--merge-output-format',
    'mp4',
    '--write-info-json',
    '--write-thumbnail',
    '--convert-thumbnails',
    'jpg',
    // Datum souboru = kdy se stáhl (řazení „Nové pohádky“), ne kdy video vyšlo.
    '--no-mtime',
    '-P',
    options.folder,
    '-o',
    `%(title).${titleBytesFor(options.folder)}B [%(id)s].%(ext)s`,
    '--newline',
    '--progress-template',
    `download:${PROGRESS_PREFIX} %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s %(info.vcodec)s`,
    '--print-to-file',
    'after_move:%(filepath)s',
    options.pathFile,
    options.url
  ]
}

const num = (value: string | undefined): number | null => {
  const parsed = Number(value)
  return value === undefined || value === 'NA' || !Number.isFinite(parsed) ? null : parsed
}

/** Řádek průběhu stahování; jiné řádky vrátí null. */
export function parseProgressLine(line: string): KidsDownloadProgress | null {
  const start = line.indexOf(PROGRESS_PREFIX)
  if (start < 0) return null
  const [downloaded, total, estimate, speed, eta, vcodec] = line
    .slice(start + PROGRESS_PREFIX.length)
    .trim()
    .split(/\s+/)
  const done = num(downloaded)
  const size = num(total) ?? num(estimate)
  return {
    phase: vcodec === 'none' ? 'audio' : 'video',
    percent: done !== null && size ? Math.min(100, Math.round((done / size) * 1000) / 10) : null,
    speed: num(speed),
    eta: num(eta)
  }
}

/** Srozumitelná chyba z výpisu yt-dlp (řádky „ERROR: …“). */
export function errorMessage(output: string[]): string {
  const errors = output.filter((line) => line.startsWith('ERROR:')).join('\n')
  const has = (pattern: RegExp): boolean => pattern.test(errors)
  if (has(/Private video|members-only|Join this channel/i))
    return 'Video je soukromé nebo jen pro členy kanálu.'
  if (has(/Sign in to confirm your age|age-restricted|inappropriate for some users/i))
    return 'Video je omezené věkem – bez přihlášení ho YouTube nevydá.'
  if (has(/available in your country|geo.?restrict/i)) return 'Video není v Česku dostupné.'
  if (
    has(/Video unavailable|video is (unavailable|not available)|has been removed|does not exist/i)
  )
    return 'Video není dostupné (smazané nebo blokované).'
  if (has(/Unsupported URL|is not a valid URL/i)) return 'Tohle není odkaz na video z YouTube.'
  if (has(/getaddrinfo|Failed to resolve|timed out|Connection|Unable to download/i))
    return 'YouTube nejde stáhnout – zkontroluj připojení k internetu.'
  if (has(/Errno 2|No such file or directory|File name too long|path.*too long/i))
    return 'Cesta k souboru je moc dlouhá – zkrať název titulu nebo zvol kratší složku s dětskými videi.'
  if (has(/Requested format is not available/i))
    return 'YouTube teď video nenabízí ke stažení. Zkus to později (případně se aktualizuje yt-dlp).'
  const last = errors.split('\n').filter(Boolean).at(-1)
  return last
    ? `Stažení se nepovedlo: ${last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)*/, '')}`
    : 'Stažení se nepovedlo.'
}

/** Kontrolní součet souboru ze seznamu SHA2-256SUMS z vydání yt-dlp. */
export function sha256For(sums: string, fileName: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim())
    if (match && match[2] === fileName) return match[1]!.toLowerCase()
  }
  return null
}
