import { describe, expect, it } from 'vitest'
import { languageName, normalizeLanguage } from './languages'
import {
  formatBitrate,
  resolutionLabel,
  summarize,
  type AudioTrackInfo,
  type MediaInfo
} from './mediaInfo'

const track = (codec: string, channels: number, atmos = false): AudioTrackInfo => ({
  number: 1,
  codec,
  channels,
  layout: channels === 8 ? '7.1' : channels === 6 ? '5.1' : '2.0',
  atmos,
  language: null,
  title: null,
  default: false,
  bitrate: null
})

describe('resolutionLabel', () => {
  it.each([
    [3840, 2160, '4K'],
    [3840, 1600, '4K'],
    [1920, 1080, '1080p'],
    [1920, 800, '1080p'],
    [1280, 720, '720p'],
    [1280, 536, '720p'],
    [720, 576, 'SD']
  ])('%i×%i → %s', (w, h, label) => {
    expect(resolutionLabel(w, h)).toBe(label)
  })
})

describe('summarize', () => {
  it('vybere nejlepší zvukovou stopu (Atmos > TrueHD > DTS-HD MA > E-AC3 > AAC)', () => {
    const info: MediaInfo = {
      container: 'MKV',
      durationSec: 100,
      bitrate: null,
      video: {
        codec: 'HEVC',
        width: 3840,
        height: 2160,
        fps: 24,
        bitDepth: 10,
        hdr: 'HDR10',
        bitrate: null
      },
      audio: [track('E-AC3', 6), track('DTS-HD MA', 8), track('TrueHD', 8, true), track('AAC', 2)],
      subtitles: []
    }
    expect(summarize(info)).toEqual({
      resolution: '4K',
      hdr: 'HDR10',
      audio: 'TrueHD Atmos 7.1',
      durationSec: 100
    })
  })

  it('bez videa a zvuku', () => {
    expect(
      summarize({
        container: 'MKV',
        durationSec: 0,
        bitrate: null,
        video: null,
        audio: [],
        subtitles: []
      })
    ).toEqual({ resolution: '–', hdr: null, audio: null, durationSec: 0 })
  })
})

describe('formatBitrate', () => {
  it.each([
    [null, '–'],
    [640_000, '640 kb/s'],
    [18_400_000, '18,4 Mb/s']
  ])('%s → %s', (input, expected) => {
    expect(formatBitrate(input)).toBe(expected)
  })
})

describe('jazyky', () => {
  it('normalizuje kódy z kontejnerů', () => {
    expect(normalizeLanguage('cze')).toBe('cs')
    expect(normalizeLanguage('ces')).toBe('cs')
    expect(normalizeLanguage('ENG')).toBe('en')
    expect(normalizeLanguage('und')).toBeNull()
    expect(normalizeLanguage(undefined)).toBeNull()
  })

  it('vrátí český název jazyka', () => {
    expect(languageName('cs')).toBe('čeština')
    expect(languageName('en')).toBe('angličtina')
    expect(languageName(null)).toBe('neznámý jazyk')
  })
})
