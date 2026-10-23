import { describe, expect, it } from 'vitest'
import {
  chooseSubtitleTrack,
  decodeSubtitle,
  DEFAULT_SUBTITLE_SETTINGS,
  detectSubtitleEncoding,
  parseSubtitleSettings,
  subtitleMatchesVideo,
  subtitleNameInfo,
  subtitleStyleArgs,
  subtitleTracksFromMpv,
  SUBTITLES_OFF,
  type SubtitleTrack
} from './subtitles'

const SAMPLE = 'Příliš žluťoučký kůň úpěl ďábelské ódy. ŠŤŽ'

const encode = (text: string, table: Record<string, number>): Uint8Array =>
  Uint8Array.from([...text].map((ch) => table[ch] ?? ch.charCodeAt(0)))

// Jen znaky z ukázkové věty.
const CP1250: Record<string, number> = {
  ř: 0xf8,
  í: 0xed,
  š: 0x9a,
  ž: 0x9e,
  ť: 0x9d,
  č: 0xe8,
  ý: 0xfd,
  ů: 0xf9,
  ú: 0xfa,
  ě: 0xec,
  ď: 0xef,
  ň: 0xf2,
  á: 0xe1,
  é: 0xe9,
  ó: 0xf3,
  Š: 0x8a,
  Ť: 0x8d,
  Ž: 0x8e,
  P: 0x50
}
const ISO_8859_2: Record<string, number> = {
  ...CP1250,
  š: 0xb9,
  ž: 0xbe,
  ť: 0xbb,
  Š: 0xa9,
  Ť: 0xab,
  Ž: 0xae
}

describe('kódování titulků', () => {
  it('rozpozná Windows-1250 a správně dekóduje diakritiku', () => {
    const bytes = encode(SAMPLE, CP1250)
    expect(detectSubtitleEncoding(bytes)).toBe('windows-1250')
    expect(decodeSubtitle(bytes).text).toBe(SAMPLE)
  })

  it('rozpozná ISO-8859-2', () => {
    const bytes = encode(SAMPLE, ISO_8859_2)
    expect(detectSubtitleEncoding(bytes)).toBe('iso-8859-2')
    expect(decodeSubtitle(bytes).text).toBe(SAMPLE)
  })

  it('UTF-8 s BOM i bez něj, UTF-16', () => {
    const utf8 = new TextEncoder().encode(SAMPLE)
    expect(decodeSubtitle(utf8)).toEqual({ text: SAMPLE, encoding: 'utf-8' })
    expect(decodeSubtitle(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8])).text).toBe(SAMPLE)
    const utf16 = Uint8Array.from([
      0xff,
      0xfe,
      ...[...SAMPLE].flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8])
    ])
    expect(decodeSubtitle(utf16)).toEqual({ text: SAMPLE, encoding: 'utf-16le' })
  })

  it('čistě ASCII text je UTF-8', () => {
    expect(
      detectSubtitleEncoding(new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nHi'))
    ).toBe('utf-8')
  })
})

describe('externí titulky podle názvu', () => {
  const video = 'Úkryt nebo past (2026) cz dabing'

  it('patří k filmu, když název začíná názvem videa', () => {
    expect(subtitleMatchesVideo(video, 'Úkryt nebo past (2026) cz dabing')).toBe(true)
    expect(subtitleMatchesVideo(video, 'Ukryt.nebo.past.(2026).cz.dabing.cze')).toBe(true)
    expect(subtitleMatchesVideo(video, 'Úkryt nebo past (2026) cz dabingX')).toBe(false)
    expect(subtitleMatchesVideo(video, 'Prázdnota (2020)')).toBe(false)
  })

  it('jazyk a vynucené z přípony', () => {
    expect(subtitleNameInfo(video, `${video}.cze`)).toEqual({ language: 'cs', forced: false })
    expect(subtitleNameInfo(video, `${video}.CZ.forced`)).toEqual({ language: 'cs', forced: true })
    expect(subtitleNameInfo(video, `${video}_eng`)).toEqual({ language: 'en', forced: false })
    expect(subtitleNameInfo(video, video)).toEqual({ language: null, forced: false })
  })
})

const sub = (
  id: number,
  language: string | null,
  extra: Partial<SubtitleTrack> = {}
): SubtitleTrack => ({
  id,
  language,
  title: null,
  codec: 'SRT',
  forced: false,
  default: false,
  external: false,
  image: false,
  selected: false,
  ...extra
})

describe('chooseSubtitleTrack', () => {
  const tracks = [
    sub(1, 'cs', { forced: true, title: 'CZ forced' }),
    sub(2, 'cs', { title: 'CZ full' }),
    sub(3, 'en')
  ]
  const settings = DEFAULT_SUBTITLE_SETTINGS

  it('u českého zvuku v chytrém režimu jen vynucené české', () => {
    expect(chooseSubtitleTrack(tracks, 'cs', null, settings)).toBe(1)
    expect(chooseSubtitleTrack([sub(2, 'cs'), sub(3, 'en')], 'cs', null, settings)).toBeNull()
  })

  it('u cizího zvuku plné titulky v preferovaném jazyce', () => {
    expect(chooseSubtitleTrack(tracks, 'en', null, settings)).toBe(2)
    expect(chooseSubtitleTrack([sub(3, 'en'), sub(4, 'sk')], 'ja', null, settings)).toBe(4)
  })

  it('režim vždy a vypnuto', () => {
    expect(chooseSubtitleTrack(tracks, 'cs', null, { ...settings, mode: 'always' })).toBe(2)
    expect(chooseSubtitleTrack(tracks, 'en', null, { ...settings, mode: 'off' })).toBeNull()
  })

  it('textové titulky mají přednost před obrázkovými', () => {
    const both = [sub(5, 'cs', { image: true, codec: 'PGS' }), sub(6, 'cs')]
    expect(chooseSubtitleTrack(both, 'en', null, settings)).toBe(6)
  })

  it('zapamatovaná volba: konkrétní stopa i „vypnuto“', () => {
    expect(chooseSubtitleTrack(tracks, 'cs', { language: 'cs', title: 'CZ full' }, settings)).toBe(
      2
    )
    expect(
      chooseSubtitleTrack(tracks, 'en', { language: SUBTITLES_OFF, title: null }, settings)
    ).toBeNull()
    expect(chooseSubtitleTrack(tracks, 'cs', { language: 'en', title: null }, settings)).toBe(3)
  })
})

describe('subtitleTracksFromMpv', () => {
  it('převede titulkové stopy z track-list', () => {
    expect(
      subtitleTracksFromMpv([
        { id: 1, type: 'audio', lang: 'cze' },
        {
          id: 1,
          type: 'sub',
          lang: 'cze',
          title: 'CZ forced',
          codec: 'subrip',
          default: true,
          selected: true
        },
        { id: 2, type: 'sub', lang: 'eng', codec: 'hdmv_pgs_subtitle', external: false },
        { id: 3, type: 'sub', codec: 'subrip', external: true, title: 'Film.cz.srt' }
      ])
    ).toEqual([
      {
        id: 1,
        language: 'cs',
        title: 'CZ forced',
        codec: 'SRT',
        forced: true,
        default: true,
        external: false,
        image: false,
        selected: true
      },
      {
        id: 2,
        language: 'en',
        title: null,
        codec: 'PGS',
        forced: false,
        default: false,
        external: false,
        image: true,
        selected: false
      },
      {
        id: 3,
        language: null,
        title: 'Film.cz.srt',
        codec: 'SRT',
        forced: false,
        default: false,
        external: true,
        image: false,
        selected: false
      }
    ])
  })
})

describe('nastavení a styl', () => {
  it('neplatné hodnoty nahradí výchozími a meze ohlídá', () => {
    expect(parseSubtitleSettings(undefined)).toEqual(DEFAULT_SUBTITLE_SETTINGS)
    expect(
      parseSubtitleSettings({
        mode: 'x',
        style: { size: 500, color: 'red', outline: -1, position: 50 }
      })
    ).toMatchObject({
      mode: 'smart',
      style: { size: 90, color: '#ffffff', outline: 0, position: 50 }
    })
  })

  it('styl → volby mpv', () => {
    expect(subtitleStyleArgs({ ...DEFAULT_SUBTITLE_SETTINGS.style, background: true })).toEqual([
      '--sub-font-size=42',
      '--sub-color=#ffffff',
      '--sub-outline-color=#000000',
      '--sub-outline-size=2',
      '--sub-border-style=background-box',
      '--sub-back-color=#B0000000',
      '--sub-pos=96',
      '--sub-bold=yes'
    ])
  })
})
