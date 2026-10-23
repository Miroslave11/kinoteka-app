import type { TrackPreference } from './audio'
import { normalizeLanguage } from './languages'

/** Titulková stopa tak, jak ji ukazuje panel v přehrávači. */
export interface SubtitleTrack {
  /** ID stopy v mpv (`sid`). */
  id: number
  language: string | null
  title: string | null
  /** „SRT“, „ASS“, „PGS“… */
  codec: string
  forced: boolean
  default: boolean
  /** Ze samostatného souboru vedle filmu. */
  external: boolean
  /** Obrázkové titulky (PGS, VobSub) – styl na ně nepůsobí. */
  image: boolean
  selected: boolean
}

/** Zapamatovaná volba „titulky vypnuté“ (jazyk v TrackPreference). */
export const SUBTITLES_OFF = 'off'

/**
 * smart  – u zvuku v prvním preferovaném jazyce jen vynucené titulky (překlad cizích pasáží),
 *          jinak plné titulky v preferovaném jazyce
 * always – vždy plné titulky v preferovaném jazyce
 * off    – titulky vypnuté
 */
export type SubtitleMode = 'smart' | 'always' | 'off'

export const SUBTITLE_MODES: { id: SubtitleMode; label: string }[] = [
  { id: 'smart', label: 'Chytře – u dabingu jen vynucené, u cizího zvuku plné' },
  { id: 'always', label: 'Vždy plné titulky' },
  { id: 'off', label: 'Vypnuté' }
]

export interface SubtitleStyle {
  /** Velikost písma (mpv `sub-font-size`, výchozí 38 pro výšku 720 bodů). */
  size: number
  color: string
  outlineColor: string
  /** Tloušťka obrysu 0–5. */
  outline: number
  /** Poloprůhledný pruh pod textem místo obrysu. */
  background: boolean
  /** Svislá pozice 0 (nahoře) až 100 (dole). */
  position: number
  bold: boolean
}

export interface SubtitleSettings {
  mode: SubtitleMode
  languages: string[]
  style: SubtitleStyle
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 42,
  color: '#ffffff',
  outlineColor: '#000000',
  outline: 2,
  background: false,
  position: 96,
  bold: true
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  mode: 'smart',
  languages: ['cs', 'sk', 'en'],
  style: DEFAULT_SUBTITLE_STYLE
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback

export function parseSubtitleSettings(value: unknown): SubtitleSettings {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const style =
    typeof input['style'] === 'object' && input['style'] !== null
      ? (input['style'] as Record<string, unknown>)
      : {}
  const d = DEFAULT_SUBTITLE_STYLE
  const color = (v: unknown, fallback: string): string =>
    typeof v === 'string' && HEX_COLOR.test(v) ? v.toLowerCase() : fallback
  return {
    mode: SUBTITLE_MODES.find((m) => m.id === input['mode'])?.id ?? 'smart',
    languages: Array.isArray(input['languages'])
      ? [
          ...new Set(
            (input['languages'] as unknown[])
              .map(normalizeLanguage)
              .filter((code): code is string => code !== null)
          )
        ]
      : DEFAULT_SUBTITLE_SETTINGS.languages,
    style: {
      size: Math.round(clamp(style['size'], 20, 90, d.size)),
      color: color(style['color'], d.color),
      outlineColor: color(style['outlineColor'], d.outlineColor),
      outline: clamp(style['outline'], 0, 5, d.outline),
      background: typeof style['background'] === 'boolean' ? style['background'] : d.background,
      position: Math.round(clamp(style['position'], 0, 100, d.position)),
      bold: typeof style['bold'] === 'boolean' ? style['bold'] : d.bold
    }
  }
}

/** Styl → volby mpv. Platí pro textové titulky (SRT); ASS si nechávají vlastní styl. */
export function subtitleStyleArgs(style: SubtitleStyle): string[] {
  return [
    `--sub-font-size=${style.size}`,
    `--sub-color=${style.color}`,
    `--sub-outline-color=${style.outlineColor}`,
    `--sub-outline-size=${style.outline}`,
    `--sub-border-style=${style.background ? 'background-box' : 'outline-and-shadow'}`,
    '--sub-back-color=#B0000000',
    `--sub-pos=${style.position}`,
    `--sub-bold=${style.bold ? 'yes' : 'no'}`
  ]
}

const IMAGE_CODECS = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'pgs', 'vobsub']
const CODECS: Record<string, string> = {
  subrip: 'SRT',
  srt: 'SRT',
  ass: 'ASS',
  ssa: 'SSA',
  webvtt: 'VTT',
  mov_text: 'MP4',
  microdvd: 'SUB',
  hdmv_pgs_subtitle: 'PGS',
  dvd_subtitle: 'VobSub',
  dvb_subtitle: 'DVB'
}

const isForcedTitle = (title: string | null): boolean =>
  !!title && /forced|vynucen|nucen/i.test(title)

/** Vlastnost mpv `track-list` → titulkové stopy. */
export function subtitleTracksFromMpv(trackList: unknown): SubtitleTrack[] {
  if (!Array.isArray(trackList)) return []
  return trackList
    .map((t) => (typeof t === 'object' && t !== null ? (t as Record<string, unknown>) : {}))
    .filter((t) => t['type'] === 'sub' && Number.isInteger(t['id']))
    .map((t) => {
      const codec = typeof t['codec'] === 'string' ? t['codec'] : ''
      const title = typeof t['title'] === 'string' && t['title'].trim() ? t['title'] : null
      return {
        id: Number(t['id']),
        language: normalizeLanguage(t['lang']),
        title,
        codec: CODECS[codec] ?? codec.toUpperCase(),
        forced: t['forced'] === true || isForcedTitle(title),
        default: t['default'] === true,
        external: t['external'] === true,
        image: IMAGE_CODECS.includes(codec),
        selected: t['selected'] === true
      }
    })
}

/**
 * Které titulky zapnout (null = žádné): zapamatovaná volba pro titul, jinak podle režimu.
 * `audioLanguage` je jazyk vybrané zvukové stopy.
 */
export function chooseSubtitleTrack(
  tracks: SubtitleTrack[],
  audioLanguage: string | null,
  remembered: TrackPreference | null,
  settings: Pick<SubtitleSettings, 'mode' | 'languages'>
): number | null {
  const best = (candidates: SubtitleTrack[], forced: boolean): SubtitleTrack | undefined =>
    [...candidates]
      .filter((t) => t.forced === forced)
      .sort(
        (a, b) =>
          Number(b.default) - Number(a.default) || Number(a.image) - Number(b.image) || a.id - b.id
      )[0]

  if (remembered) {
    if (remembered.language === SUBTITLES_OFF) return null
    const same = tracks.filter((t) => t.language === remembered.language)
    const found =
      same.find((t) => remembered.title !== null && t.title === remembered.title) ??
      best(same, false) ??
      best(same, true)
    if (found) return found.id
  }
  if (settings.mode === 'off') return null

  const [first] = settings.languages
  if (settings.mode === 'smart' && audioLanguage && audioLanguage === first) {
    return (
      best(
        tracks.filter((t) => t.language === audioLanguage || t.language === null),
        true
      )?.id ?? null
    )
  }
  for (const language of settings.languages) {
    const found = best(
      tracks.filter((t) => t.language === language),
      false
    )
    if (found) return found.id
  }
  return null
}

// ---------- externí soubory ----------

export const SUBTITLE_EXTENSIONS = ['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx'] as const

/** Kódy jazyků, které se v názvech titulků objevují navíc k ISO kódům. */
const FILENAME_LANGUAGES: Record<string, string> = {
  cz: 'cs',
  czech: 'cs',
  cesky: 'cs',
  cestina: 'cs',
  sk: 'sk',
  slovak: 'sk',
  english: 'en',
  eng: 'en'
}

const simplify = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Patří soubor titulků k filmu? Název titulků musí začínat názvem videa
 * (bez ohledu na diakritiku, velikost písmen a oddělovače).
 */
export function subtitleMatchesVideo(videoBase: string, subtitleBase: string): boolean {
  const video = simplify(videoBase)
  const subtitle = simplify(subtitleBase)
  return video !== '' && (subtitle === video || subtitle.startsWith(`${video} `))
}

/** Jazyk a „forced“ z přípony názvu: „Film.cze.forced“ → { language: 'cs', forced: true }. */
export function subtitleNameInfo(
  videoBase: string,
  subtitleBase: string
): { language: string | null; forced: boolean } {
  const rest = simplify(subtitleBase).slice(simplify(videoBase).length).trim()
  const tokens = rest.split(' ').filter(Boolean)
  let language: string | null = null
  for (const token of tokens.reverse()) {
    const code = FILENAME_LANGUAGES[token] ?? (token.length <= 3 ? normalizeLanguage(token) : null)
    if (code && code.length === 2) {
      language = code
      break
    }
  }
  return { language, forced: tokens.some((t) => /forced|vynucene/.test(t)) }
}

// ---------- kódování ----------

export type SubtitleEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1250' | 'iso-8859-2'

/**
 * Kódování textových titulků: BOM, platné UTF-8, jinak čeština ve Windows-1250
 * nebo ISO-8859-2 (liší se umístěním š, ž, Š, Ž, ť, Ť).
 */
export function detectSubtitleEncoding(bytes: Uint8Array): SubtitleEncoding {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return 'utf-8'
  } catch {
    // není UTF-8
  }
  let cp1250 = 0
  let iso = 0
  for (const byte of bytes) {
    // 0x80–0x9F jsou v ISO-8859-2 řídicí znaky, ve Windows-1250 Š Ť Ž š ť ž a další.
    if (byte >= 0x80 && byte <= 0x9f) cp1250++
    // š ž Š Ž ť Ť v ISO-8859-2 (ve Windows-1250 ą ľ © ® » «)
    else if ([0xb9, 0xbe, 0xa9, 0xae, 0xbb, 0xab].includes(byte)) iso++
  }
  return iso > cp1250 ? 'iso-8859-2' : 'windows-1250'
}

/** Textové titulky jako UTF-8 text (TextDecoder úvodní BOM sám vynechá). */
export function decodeSubtitle(bytes: Uint8Array): { text: string; encoding: SubtitleEncoding } {
  const encoding = detectSubtitleEncoding(bytes)
  const text = new TextDecoder(encoding).decode(bytes)
  return { text, encoding }
}
