import type { KidsDownloadProgress } from '../../shared/kids'

/**
 * Formát: nejlépe H.264 do 1080p (přehraje cokoli a nezatíží procesor), jinak nejlepší
 * dostupný obraz do 1080p, jinak cokoli. Obraz a zvuk spojí ffmpeg do mp4.
 */
export const YTDLP_FORMAT =
  'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b'

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
}

export function buildDownloadArgs(options: DownloadArgsOptions): string[] {
  return [
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
    `node:${options.nodePath}`,
    '--ffmpeg-location',
    options.ffmpegDir,
    '--no-playlist',
    '-f',
    YTDLP_FORMAT,
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
    '%(title).150B [%(id)s].%(ext)s',
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
