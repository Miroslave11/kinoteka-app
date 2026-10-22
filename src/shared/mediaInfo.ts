/** Technické vlastnosti souboru zjištěné přes ffprobe. */
export interface MediaInfo {
  /** Čitelný kontejner: „MKV“, „MP4“, „AVI“… */
  container: string
  durationSec: number
  /** Celkový datový tok v bitech za sekundu. */
  bitrate: number | null
  video: VideoTrackInfo | null
  audio: AudioTrackInfo[]
  subtitles: SubtitleTrackInfo[]
}

export interface VideoTrackInfo {
  /** „HEVC“, „H.264“, „AV1“… */
  codec: string
  width: number
  height: number
  fps: number | null
  bitDepth: number | null
  hdr: 'HDR10' | 'HLG' | 'Dolby Vision' | null
  bitrate: number | null
}

export interface AudioTrackInfo {
  /** Pořadí zvukové stopy (1, 2, …) – stejně ji později vybírá přehrávač. */
  number: number
  /** „E-AC3“, „TrueHD“, „DTS-HD MA“, „AAC“… */
  codec: string
  channels: number
  /** „5.1“, „7.1“, „2.0“ */
  layout: string
  atmos: boolean
  /** ISO 639-1, pokud je známý („cs“, „en“). */
  language: string | null
  title: string | null
  default: boolean
  bitrate: number | null
}

export interface SubtitleTrackInfo {
  number: number
  /** „SRT“, „ASS“, „PGS“, „VobSub“… */
  codec: string
  language: string | null
  title: string | null
  default: boolean
  forced: boolean
  /** Obrázkové titulky (PGS, VobSub) nejde stylovat. */
  image: boolean
}

/** Krátké shrnutí pro karty a štítky. */
export interface MediaSummary {
  resolution: string
  hdr: string | null
  /** Nejlepší zvuková stopa, např. „TrueHD Atmos 7.1“. */
  audio: string | null
  durationSec: number
}

export function resolutionLabel(width: number, height: number): string {
  // Širokoúhlé filmy mají menší výšku (1920×800), rozhoduje proto i šířka.
  if (width >= 3200 || height >= 1800) return '4K'
  if (width >= 1800 || height >= 1000) return '1080p'
  if (width >= 1200 || height >= 700) return '720p'
  return 'SD'
}

export function audioLabel(track: AudioTrackInfo): string {
  return `${track.codec}${track.atmos ? ' Atmos' : ''} ${track.layout}`
}

/** Pořadí kvality zvuku pro výběr „nejlepší“ stopy do shrnutí. */
const AUDIO_RANK = ['TrueHD', 'DTS-HD MA', 'DTS:X', 'FLAC', 'PCM', 'DTS-HD', 'E-AC3', 'DTS', 'AC3']

export function summarize(info: MediaInfo): MediaSummary {
  const best = [...info.audio].sort((a, b) => {
    const rank = (t: AudioTrackInfo): number => {
      const index = AUDIO_RANK.indexOf(t.codec)
      return (t.atmos ? -100 : 0) + (index === -1 ? AUDIO_RANK.length : index)
    }
    return rank(a) - rank(b) || b.channels - a.channels
  })[0]
  return {
    resolution: info.video ? resolutionLabel(info.video.width, info.video.height) : '–',
    hdr: info.video?.hdr ?? null,
    audio: best ? audioLabel(best) : null,
    durationSec: info.durationSec
  }
}

/** 18 400 000 → „18,4 Mb/s“. */
export function formatBitrate(bitsPerSecond: number | null): string {
  if (!bitsPerSecond) return '–'
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} Mb/s`
  }
  return `${Math.round(bitsPerSecond / 1000)} kb/s`
}
