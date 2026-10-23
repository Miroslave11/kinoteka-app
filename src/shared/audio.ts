import { normalizeLanguage } from './languages'

/** Formáty, které umí jít nedekódované přes HDMI (hodnoty volby mpv `--audio-spdif`). */
export const PASSTHROUGH_FORMATS = [
  { id: 'ac3', label: 'Dolby Digital (AC3)' },
  { id: 'eac3', label: 'Dolby Digital Plus (E-AC3)' },
  { id: 'truehd', label: 'Dolby TrueHD / Atmos' },
  { id: 'dts', label: 'DTS' },
  { id: 'dts-hd', label: 'DTS-HD Master Audio' }
] as const

export type PassthroughFormat = (typeof PASSTHROUGH_FORMATS)[number]['id']

export const PCM_CHANNELS = [
  { id: 'auto', label: 'Podle zařízení (doporučeno)' },
  { id: 'stereo', label: 'Stereo' },
  { id: '5.1', label: '5.1' },
  { id: '7.1', label: '7.1' }
] as const

export type PcmChannels = (typeof PCM_CHANNELS)[number]['id']

export interface AudioSettings {
  /** Formáty posílané do receiveru jako bitstream; ostatní dekóduje počítač (PCM). */
  passthrough: PassthroughFormat[]
  /** Zvukové zařízení mpv („auto“ = výchozí zařízení Windows). */
  device: string
  /** Rozložení kanálů, když počítač zvuk dekóduje. */
  channels: PcmChannels
  /** Preferované jazyky zvuku v pořadí (ISO 639-1, „cs“, „en“…). */
  languages: string[]
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  passthrough: PASSTHROUGH_FORMATS.map((format) => format.id),
  device: 'auto',
  channels: 'auto',
  languages: ['cs', 'en']
}

/** Ověří nastavení z okna nebo databáze; chybějící nebo neplatné části doplní výchozími. */
export function parseAudioSettings(value: unknown): AudioSettings {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const passthrough = Array.isArray(input['passthrough'])
    ? PASSTHROUGH_FORMATS.map((f) => f.id).filter((id) =>
        (input['passthrough'] as unknown[]).includes(id)
      )
    : DEFAULT_AUDIO_SETTINGS.passthrough
  const channels = PCM_CHANNELS.find((c) => c.id === input['channels'])?.id ?? 'auto'
  const device =
    typeof input['device'] === 'string' && input['device'].trim() ? input['device'] : 'auto'
  const languages = Array.isArray(input['languages'])
    ? [
        ...new Set(
          (input['languages'] as unknown[])
            .map(normalizeLanguage)
            .filter((code): code is string => code !== null)
        )
      ]
    : DEFAULT_AUDIO_SETTINGS.languages
  return { passthrough, device, channels, languages }
}

/** Hodnota volby mpv `--audio-channels`. */
export const mpvAudioChannels = (channels: PcmChannels): string =>
  channels === 'auto' ? 'auto' : channels === 'stereo' ? 'stereo' : `${channels},stereo`

/** Zvuková stopa souboru tak, jak ji ukazuje panel v přehrávači. */
export interface AudioTrack {
  /** ID stopy v mpv (`aid`). */
  id: number
  /** ISO 639-1, null = neznámý. */
  language: string | null
  title: string | null
  /** „E-AC3“, „DTS-HD“… */
  codec: string
  /** „5.1“, „2.0“… nebo prázdné. */
  channels: string
  default: boolean
  selected: boolean
}

const CODECS: Record<string, string> = {
  ac3: 'AC3',
  eac3: 'E-AC3',
  truehd: 'TrueHD',
  dts: 'DTS',
  aac: 'AAC',
  opus: 'Opus',
  flac: 'FLAC',
  mp3: 'MP3',
  vorbis: 'Vorbis',
  pcm_s16le: 'PCM',
  pcm_s24le: 'PCM'
}

const LAYOUTS: Record<number, string> = {
  1: '1.0',
  2: '2.0',
  3: '2.1',
  6: '5.1',
  7: '6.1',
  8: '7.1'
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

/** Vlastnost mpv `track-list` → zvukové stopy. */
export function audioTracksFromMpv(trackList: unknown): AudioTrack[] {
  if (!Array.isArray(trackList)) return []
  return trackList
    .map(record)
    .filter((track) => track['type'] === 'audio' && Number.isInteger(track['id']))
    .map((track) => {
      const codecId = typeof track['codec'] === 'string' ? track['codec'] : ''
      const profile = typeof track['codec-profile'] === 'string' ? track['codec-profile'] : ''
      const count = Number(track['demux-channel-count'] ?? 0)
      const title =
        typeof track['title'] === 'string' && track['title'].trim() ? track['title'] : null
      return {
        id: Number(track['id']),
        language: normalizeLanguage(track['lang']),
        title,
        codec:
          codecId === 'dts' && /HD MA|DTS-HD/i.test(profile)
            ? 'DTS-HD MA'
            : (CODECS[codecId] ?? codecId.toUpperCase()),
        channels: LAYOUTS[count] ?? (count > 0 ? `${count} kan.` : ''),
        default: track['default'] === true,
        selected: track['selected'] === true
      }
    })
}

/** Zapamatovaná volba stopy pro film nebo seriál. */
export interface TrackPreference {
  language: string | null
  title: string | null
}

/**
 * Kterou zvukovou stopu pustit: zapamatovanou volbu pro titul, jinak první preferovaný jazyk
 * (u více stop téhož jazyka výchozí, pak ta s více kanály), jinak výchozí stopu souboru.
 */
export function chooseAudioTrack(
  tracks: AudioTrack[],
  remembered: TrackPreference | null,
  languages: string[]
): number | null {
  if (tracks.length === 0) return null
  const best = (candidates: AudioTrack[]): AudioTrack | undefined =>
    [...candidates].sort(
      (a, b) =>
        Number(b.default) - Number(a.default) ||
        (parseFloat(b.channels) || 0) - (parseFloat(a.channels) || 0) ||
        a.id - b.id
    )[0]

  if (remembered) {
    const sameLanguage = tracks.filter((t) => t.language === remembered.language)
    const exact = sameLanguage.find((t) => remembered.title && t.title === remembered.title)
    const found = exact ?? best(sameLanguage)
    if (found) return found.id
  }
  for (const language of languages) {
    const found = best(tracks.filter((t) => t.language === language))
    if (found) return found.id
  }
  return (tracks.find((t) => t.default) ?? tracks[0]!).id
}

/** Seznam zařízení z výpisu `mpv --audio-device=help`. */
export interface AudioDevice {
  name: string
  description: string
}

export function parseAudioDeviceList(output: string): AudioDevice[] {
  const devices: AudioDevice[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*'([^']+)'\s+\((.*)\)\s*$/.exec(line)
    if (match) devices.push({ name: match[1]!, description: match[2]! })
  }
  return devices
}
