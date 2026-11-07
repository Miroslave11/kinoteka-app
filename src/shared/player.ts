import type { AudioTrack } from './audio'
import type { SubtitleTrack } from './subtitles'

/** Co právě hraje – posílá hlavní proces do ovládacího overlaye. */
export interface PlayerState {
  title: string
  paused: boolean
  /** Pozice v sekundách. */
  position: number
  /** Délka v sekundách (0, dokud ji mpv nezná). */
  duration: number
  /** Hlasitost 0–100. */
  volume: number
  muted: boolean
  fullscreen: boolean
  ended: boolean
  audio: AudioOutputInfo | null
  video: VideoInfo | null
  /** Další díl seriálu („S01E03 · Název“); null = není. */
  next: string | null
  /** Předchozí díl seriálu; null = není. */
  previous: string | null
  /** Zvukové stopy souboru (vybraná má `selected`). */
  audioTracks: AudioTrack[]
  subtitleTracks: SubtitleTrack[]
  /** Posun titulků v sekundách (kladný = později). */
  subDelay: number
  /** Upozornění, které overlay na chvíli ukáže. */
  notice: string | null
  /** Pohádka z dětské části – overlay ukáže dětské ovládání; null = běžné přehrávání. */
  kids: KidsPlayerInfo | null
}

export interface KidsPlayerInfo {
  /** V titulu je předchozí pohádka. */
  hasPrevious: boolean
  /** Další pohádka titulu; null = tahle je poslední. */
  next: { name: string; thumbnailUrl: string | null } | null
  /** Po konci se další pohádka spustí sama. */
  autoplayNext: boolean
  favorite: boolean
  /** Zbývající čas pohádek dnes v sekundách; null = bez limitu. */
  timeLeftSec: number | null
  /** Čas pohádek došel – přehrávač ukáže „Pohádky pro dnešek skončily“. */
  limitReached: boolean
}

export interface AudioOutputInfo {
  /** Čitelný název kodeku, např. „E-AC3“, „DTS-HD“. */
  codec: string
  /** Rozložení kanálů, např. „5.1“. */
  channels: string
  /** true = zvuk jde nedekódovaný (bitstream) do receiveru. */
  passthrough: boolean
}

export interface VideoInfo {
  codec: string
  width: number
  height: number
}

export const INITIAL_PLAYER_STATE: PlayerState = {
  title: '',
  paused: false,
  position: 0,
  duration: 0,
  volume: 100,
  muted: false,
  fullscreen: false,
  ended: false,
  audio: null,
  video: null,
  next: null,
  previous: null,
  audioTracks: [],
  subtitleTracks: [],
  subDelay: 0,
  notice: null,
  kids: null
}

export type PlayerCommand =
  | { type: 'toggle-pause' }
  | { type: 'set-pause'; paused: boolean }
  | { type: 'seek-relative'; seconds: number }
  | { type: 'seek-absolute'; seconds: number }
  | { type: 'set-volume'; volume: number }
  | { type: 'toggle-mute' }
  | { type: 'toggle-fullscreen' }
  | { type: 'escape' }
  | { type: 'close' }
  /** Zastavit: zavřít a zapomenout rozkoukání (příště od začátku). */
  | { type: 'stop' }
  | { type: 'play-next' }
  /** Dětský přehrávač: předchozí pohádka a srdíčko. */
  | { type: 'play-previous' }
  | { type: 'toggle-favorite' }
  | { type: 'set-audio-track'; id: number }
  /** null = titulky vypnout */
  | { type: 'set-subtitle-track'; id: number | null }
  | { type: 'set-sub-delay'; seconds: number }
  | { type: 'load-subtitle' }

export type OpenFileResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'error'; message: string }

export interface PlayerClosedInfo {
  /** Vyplněno, když přehrávání skončilo chybou. */
  error?: string
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Ověří příkaz přicházející z okna – UI se nevěří, posílá jen data. */
export function parsePlayerCommand(value: unknown): PlayerCommand | null {
  if (typeof value !== 'object' || value === null) return null
  const command = value as Record<string, unknown>
  switch (command['type']) {
    case 'toggle-pause':
    case 'toggle-mute':
    case 'toggle-fullscreen':
    case 'escape':
    case 'close':
    case 'stop':
    case 'play-next':
    case 'play-previous':
    case 'toggle-favorite':
    case 'load-subtitle':
      return { type: command['type'] }
    case 'set-pause':
      return typeof command['paused'] === 'boolean'
        ? { type: 'set-pause', paused: command['paused'] }
        : null
    case 'seek-relative':
      return isFiniteNumber(command['seconds'])
        ? { type: 'seek-relative', seconds: command['seconds'] }
        : null
    case 'seek-absolute':
      return isFiniteNumber(command['seconds']) && command['seconds'] >= 0
        ? { type: 'seek-absolute', seconds: command['seconds'] }
        : null
    case 'set-audio-track':
      return Number.isInteger(command['id']) && (command['id'] as number) > 0
        ? { type: 'set-audio-track', id: command['id'] as number }
        : null
    case 'set-subtitle-track':
      return command['id'] === null ||
        (Number.isInteger(command['id']) && (command['id'] as number) > 0)
        ? { type: 'set-subtitle-track', id: command['id'] as number | null }
        : null
    case 'set-sub-delay':
      return isFiniteNumber(command['seconds']) && Math.abs(command['seconds']) <= 600
        ? { type: 'set-sub-delay', seconds: Math.round(command['seconds'] * 10) / 10 }
        : null
    case 'set-volume':
      return isFiniteNumber(command['volume'])
        ? { type: 'set-volume', volume: Math.min(100, Math.max(0, command['volume'])) }
        : null
    default:
      return null
  }
}

const CODEC_LABELS: Record<string, string> = {
  ac3: 'AC3',
  eac3: 'E-AC3',
  truehd: 'TrueHD',
  dts: 'DTS',
  aac: 'AAC',
  opus: 'Opus',
  flac: 'FLAC',
  mp3: 'MP3',
  vorbis: 'Vorbis'
}

const CHANNEL_LAYOUTS: Record<number, string> = { 1: '1.0', 2: '2.0', 3: '2.1', 6: '5.1', 8: '7.1' }

/** Údaje z mpv (`audio-codec-name`, `audio-params`, `audio-out-params`) → popis pro UI. */
export function describeAudioOutput(input: {
  codecName?: unknown
  channelCount?: unknown
  outputFormat?: unknown
}): AudioOutputInfo | null {
  if (typeof input.codecName !== 'string' || input.codecName === '') return null
  const outputFormat = typeof input.outputFormat === 'string' ? input.outputFormat : ''
  // mpv při passthrough hlásí výstupní formát „spdif-<kodek>“.
  const passthrough = outputFormat.startsWith('spdif-')
  const codec =
    outputFormat === 'spdif-dtshd'
      ? 'DTS-HD'
      : (CODEC_LABELS[input.codecName] ?? input.codecName.toUpperCase())
  const count = typeof input.channelCount === 'number' ? input.channelCount : 0
  const channels = CHANNEL_LAYOUTS[count] ?? (count > 0 ? `${count} kan.` : '')
  return { codec, channels, passthrough }
}

/** 75 → „1:15“, 4354 → „1:12:34“. */
export function formatTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`
}
