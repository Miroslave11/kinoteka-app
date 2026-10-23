import { describe, expect, it } from 'vitest'
import {
  audioTracksFromMpv,
  chooseAudioTrack,
  DEFAULT_AUDIO_SETTINGS,
  mpvAudioChannels,
  parseAudioDeviceList,
  parseAudioSettings,
  type AudioTrack
} from './audio'

const track = (
  id: number,
  language: string | null,
  extra: Partial<AudioTrack> = {}
): AudioTrack => ({
  id,
  language,
  title: null,
  codec: 'AC3',
  channels: '5.1',
  default: false,
  selected: false,
  ...extra
})

describe('chooseAudioTrack', () => {
  const tracks = [track(1, 'en', { default: true }), track(2, 'cs'), track(3, 'de')]

  it('vybere první preferovaný jazyk, který soubor má', () => {
    expect(chooseAudioTrack(tracks, null, ['cs', 'en'])).toBe(2)
    expect(chooseAudioTrack(tracks, null, ['sk', 'de', 'en'])).toBe(3)
  })

  it('bez shody vybere výchozí stopu souboru', () => {
    expect(chooseAudioTrack(tracks, null, ['fr'])).toBe(1)
    expect(chooseAudioTrack([track(4, null), track(5, null)], null, ['cs'])).toBe(4)
  })

  it('zapamatovaná volba pro titul má přednost', () => {
    expect(chooseAudioTrack(tracks, { language: 'en', title: null }, ['cs'])).toBe(1)
  })

  it('u více stop téhož jazyka rozhodne zapamatovaný název, pak výchozí a počet kanálů', () => {
    const czech = [
      track(1, 'cs', { title: 'Dabing', channels: '2.0' }),
      track(2, 'cs', { title: 'Komentář režiséra', channels: '2.0' }),
      track(3, 'cs', { title: 'Dabing 5.1', channels: '5.1' })
    ]
    expect(chooseAudioTrack(czech, { language: 'cs', title: 'Komentář režiséra' }, [])).toBe(2)
    expect(chooseAudioTrack(czech, null, ['cs'])).toBe(3)
    czech[0]!.default = true
    expect(chooseAudioTrack(czech, null, ['cs'])).toBe(1)
  })

  it('zapamatovaný jazyk, který soubor nemá, přeskočí na preferované jazyky', () => {
    expect(chooseAudioTrack(tracks, { language: 'ja', title: null }, ['de'])).toBe(3)
  })

  it('soubor bez zvuku', () => {
    expect(chooseAudioTrack([], null, ['cs'])).toBeNull()
  })
})

describe('audioTracksFromMpv', () => {
  it('převede track-list z mpv na zvukové stopy', () => {
    expect(
      audioTracksFromMpv([
        { id: 1, type: 'video', codec: 'hevc' },
        {
          id: 1,
          type: 'audio',
          lang: 'cze',
          title: 'Dabing',
          codec: 'eac3',
          'demux-channel-count': 6,
          default: true,
          selected: true
        },
        {
          id: 2,
          type: 'audio',
          lang: 'eng',
          codec: 'dts',
          'codec-profile': 'DTS-HD MA',
          'demux-channel-count': 8
        },
        { id: 3, type: 'audio', codec: 'aac', 'demux-channel-count': 2, title: ' ' }
      ])
    ).toEqual([
      {
        id: 1,
        language: 'cs',
        title: 'Dabing',
        codec: 'E-AC3',
        channels: '5.1',
        default: true,
        selected: true
      },
      {
        id: 2,
        language: 'en',
        title: null,
        codec: 'DTS-HD MA',
        channels: '7.1',
        default: false,
        selected: false
      },
      {
        id: 3,
        language: null,
        title: null,
        codec: 'AAC',
        channels: '2.0',
        default: false,
        selected: false
      }
    ])
  })

  it('nesmysl nebo prázdný seznam', () => {
    expect(audioTracksFromMpv(null)).toEqual([])
    expect(audioTracksFromMpv([{ type: 'audio' }])).toEqual([])
  })
})

describe('parseAudioSettings', () => {
  it('chybějící nastavení = výchozí (vše passthrough, čeština a angličtina)', () => {
    expect(parseAudioSettings(undefined)).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('zahodí neznámé formáty a jazyky normalizuje', () => {
    expect(
      parseAudioSettings({
        passthrough: ['dts', 'mp3', 'ac3'],
        device: 'wasapi/{x}',
        channels: '9.1',
        languages: ['cze', 'cs', 'eng', 42]
      })
    ).toEqual({
      passthrough: ['ac3', 'dts'],
      device: 'wasapi/{x}',
      channels: 'auto',
      languages: ['cs', 'en']
    })
  })

  it('prázdný seznam passthrough = vždy PCM', () => {
    expect(parseAudioSettings({ passthrough: [] }).passthrough).toEqual([])
  })
})

describe('mpvAudioChannels', () => {
  it('pevné rozložení s náhradou stereo', () => {
    expect(mpvAudioChannels('auto')).toBe('auto')
    expect(mpvAudioChannels('stereo')).toBe('stereo')
    expect(mpvAudioChannels('5.1')).toBe('5.1,stereo')
  })
})

describe('parseAudioDeviceList', () => {
  it('přečte výpis mpv --audio-device=help', () => {
    const output = [
      'List of detected audio devices:',
      "  'auto' (Autoselect device)",
      "  'wasapi/{7874a81e-06f5}' (Speakers (2 - SoundWire Audio))",
      "  'wasapi/{1234}' (LG TV (NVIDIA High Definition Audio))"
    ].join('\r\n')
    expect(parseAudioDeviceList(output)).toEqual([
      { name: 'auto', description: 'Autoselect device' },
      { name: 'wasapi/{7874a81e-06f5}', description: 'Speakers (2 - SoundWire Audio)' },
      { name: 'wasapi/{1234}', description: 'LG TV (NVIDIA High Definition Audio)' }
    ])
  })
})
