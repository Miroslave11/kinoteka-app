import { execFile } from 'node:child_process'
import { normalizeLanguage } from '../../shared/languages'
import type {
  AudioTrackInfo,
  MediaInfo,
  SubtitleTrackInfo,
  VideoTrackInfo
} from '../../shared/mediaInfo'

type Json = Record<string, unknown>

const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(str(value))
  return Number.isFinite(parsed) ? parsed : null
}
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {}

const CONTAINERS: [RegExp, string][] = [
  [/matroska/, 'MKV'],
  [/mp4|mov|m4a/, 'MP4'],
  [/^avi$/, 'AVI'],
  [/mpegts/, 'TS'],
  [/asf/, 'WMV'],
  [/mpeg/, 'MPEG']
]

const VIDEO_CODECS: Record<string, string> = {
  hevc: 'HEVC',
  h264: 'H.264',
  av1: 'AV1',
  vp9: 'VP9',
  mpeg4: 'MPEG-4',
  mpeg2video: 'MPEG-2',
  vc1: 'VC-1',
  msmpeg4v3: 'DivX'
}

const SUBTITLE_CODECS: Record<string, string> = {
  subrip: 'SRT',
  srt: 'SRT',
  ass: 'ASS',
  ssa: 'SSA',
  webvtt: 'WebVTT',
  mov_text: 'MP4 text',
  hdmv_pgs_subtitle: 'PGS',
  dvd_subtitle: 'VobSub',
  dvb_subtitle: 'DVB'
}

const IMAGE_SUBTITLES = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle'])

const LAYOUTS: Record<number, string> = {
  1: '1.0',
  2: '2.0',
  3: '2.1',
  6: '5.1',
  7: '6.1',
  8: '7.1'
}

/** Datový tok stopy: ffprobe ho u MKV nevrací přímo, ale je ve štítku BPS. */
const streamBitrate = (stream: Json): number | null =>
  num(stream['bit_rate']) ?? num(obj(stream['tags'])['BPS'])

function frameRate(value: unknown): number | null {
  const [a, b] = str(value).split('/').map(Number)
  if (!a || !b) return null
  return Math.round((a / b) * 1000) / 1000
}

function audioCodec(stream: Json): string {
  const codec = str(stream['codec_name'])
  const profile = str(stream['profile'])
  switch (codec) {
    case 'truehd':
      return 'TrueHD'
    case 'eac3':
      return 'E-AC3'
    case 'ac3':
      return 'AC3'
    case 'dts':
      if (/DTS:X/i.test(profile)) return 'DTS:X'
      if (/MA/.test(profile)) return 'DTS-HD MA'
      if (/HD/.test(profile)) return 'DTS-HD'
      return 'DTS'
    case 'aac':
      return 'AAC'
    case 'flac':
      return 'FLAC'
    case 'opus':
      return 'Opus'
    case 'mp3':
      return 'MP3'
    default:
      return codec.startsWith('pcm') ? 'PCM' : codec.toUpperCase()
  }
}

function hdrOf(stream: Json): VideoTrackInfo['hdr'] {
  const sideData = Array.isArray(stream['side_data_list'])
    ? (stream['side_data_list'] as Json[])
    : []
  if (sideData.some((data) => /DOVI|Dolby Vision/i.test(str(data['side_data_type'])))) {
    return 'Dolby Vision'
  }
  const transfer = str(stream['color_transfer'])
  if (transfer === 'smpte2084') return 'HDR10'
  if (transfer === 'arib-std-b67') return 'HLG'
  return null
}

function bitDepth(stream: Json): number | null {
  const fromField = num(stream['bits_per_raw_sample'])
  if (fromField) return fromField
  const match = /p(\d{2})/.exec(str(stream['pix_fmt']))
  return match ? Number(match[1]) : 8
}

/** Převede JSON z `ffprobe -show_format -show_streams` na MediaInfo. */
export function parseFfprobe(output: unknown): MediaInfo {
  const root = obj(output)
  const format = obj(root['format'])
  const streams = Array.isArray(root['streams']) ? (root['streams'] as Json[]) : []
  const formatName = str(format['format_name'])

  let video: VideoTrackInfo | null = null
  const audio: AudioTrackInfo[] = []
  const subtitles: SubtitleTrackInfo[] = []

  for (const stream of streams) {
    const type = str(stream['codec_type'])
    const tags = obj(stream['tags'])
    const disposition = obj(stream['disposition'])
    if (type === 'video' && !video && disposition['attached_pic'] !== 1) {
      const codec = str(stream['codec_name'])
      video = {
        codec: VIDEO_CODECS[codec] ?? codec.toUpperCase(),
        width: num(stream['width']) ?? 0,
        height: num(stream['height']) ?? 0,
        fps: frameRate(stream['avg_frame_rate']) ?? frameRate(stream['r_frame_rate']),
        bitDepth: bitDepth(stream),
        hdr: hdrOf(stream),
        bitrate: streamBitrate(stream)
      }
    } else if (type === 'audio') {
      const channels = num(stream['channels']) ?? 0
      audio.push({
        number: audio.length + 1,
        codec: audioCodec(stream),
        channels,
        layout: LAYOUTS[channels] ?? `${channels} kan.`,
        atmos: /atmos/i.test(str(stream['profile'])) || /atmos/i.test(str(tags['title'])),
        language: normalizeLanguage(tags['language']),
        title: str(tags['title']) || null,
        default: disposition['default'] === 1,
        bitrate: streamBitrate(stream)
      })
    } else if (type === 'subtitle') {
      const codec = str(stream['codec_name'])
      subtitles.push({
        number: subtitles.length + 1,
        codec: SUBTITLE_CODECS[codec] ?? codec.toUpperCase(),
        language: normalizeLanguage(tags['language']),
        title: str(tags['title']) || null,
        default: disposition['default'] === 1,
        forced: disposition['forced'] === 1,
        image: IMAGE_SUBTITLES.has(codec)
      })
    }
  }

  return {
    container:
      CONTAINERS.find(([pattern]) => pattern.test(formatName))?.[1] ?? formatName.toUpperCase(),
    durationSec: num(format['duration']) ?? 0,
    bitrate: num(format['bit_rate']),
    video,
    audio,
    subtitles
  }
}

/** Spustí ffprobe a vrátí vlastnosti souboru. */
export function runFfprobe(
  executable: string,
  file: string,
  timeoutMs = 60_000
): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '--', file],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim().split('\n').at(-1) || error.message))
          return
        }
        try {
          resolve(parseFfprobe(JSON.parse(stdout)))
        } catch (parseError) {
          reject(parseError as Error)
        }
      }
    )
  })
}
