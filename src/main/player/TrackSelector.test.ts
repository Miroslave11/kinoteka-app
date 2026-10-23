import { describe, expect, it } from 'vitest'
import { TrackSelector, type TrackChoices } from './TrackSelector'

const TRACKS = [
  { id: 1, type: 'video' },
  { id: 1, type: 'audio', lang: 'cze', selected: true },
  { id: 2, type: 'audio', lang: 'eng' },
  { id: 1, type: 'sub', lang: 'cze', title: 'CZ forced', forced: true },
  { id: 2, type: 'sub', lang: 'cze', title: 'CZ full' }
]

function fakeMpv(): {
  mpv: { command: (...args: unknown[]) => Promise<unknown> }
  sent: unknown[][]
} {
  const sent: unknown[][] = []
  return {
    sent,
    mpv: {
      command: (...args: unknown[]) => {
        sent.push(args)
        return Promise.resolve(args[0] === 'get_property' ? TRACKS : undefined)
      }
    }
  }
}

const choices = (overrides: Partial<TrackChoices> = {}): TrackChoices => ({
  audio: { remembered: null, languages: ['cs', 'en'] },
  subtitles: { remembered: null, mode: 'smart', languages: ['cs', 'en'] },
  subDelay: 0,
  externalSubtitles: () => Promise.resolve([]),
  ...overrides
})

describe('TrackSelector', () => {
  it('u českého zvuku zapne vynucené titulky a nastaví posun', async () => {
    const { mpv, sent } = fakeMpv()
    const selector = new TrackSelector(mpv)
    selector.reset(choices({ subDelay: -0.5 }))
    await selector.onFileLoaded()
    expect(sent).toEqual([
      ['get_property', 'track-list'],
      ['set_property', 'sid', 1],
      ['set_property', 'sub-delay', -0.5]
    ])
  })

  it('zapamatovaná angličtina: přepne zvuk a zapne plné české titulky', async () => {
    const { mpv, sent } = fakeMpv()
    const selector = new TrackSelector(mpv)
    selector.reset(
      choices({ audio: { remembered: { language: 'en', title: null }, languages: ['cs'] } })
    )
    await selector.onFileLoaded()
    expect(sent).toContainEqual(['set_property', 'aid', 2])
    expect(sent).toContainEqual(['set_property', 'sid', 2])
  })

  it('externí titulky přidá před výběrem, s jazykem z názvu', async () => {
    const { mpv, sent } = fakeMpv()
    const selector = new TrackSelector(mpv)
    selector.reset(
      choices({
        externalSubtitles: () =>
          Promise.resolve([
            {
              path: 'C:\\a.cz.srt',
              title: 'a.cz.srt',
              language: 'cs',
              forced: false,
              encoding: 'utf-8'
            },
            { path: 'C:\\a.srt', title: 'a.srt', language: null, forced: false, encoding: null }
          ])
      })
    )
    await selector.onFileLoaded()
    expect(sent.slice(0, 3)).toEqual([
      ['sub-add', 'C:\\a.cz.srt', 'auto', 'a.cz.srt', 'cs'],
      ['sub-add', 'C:\\a.srt', 'auto', 'a.srt'],
      ['get_property', 'track-list']
    ])
  })

  it('proběhne jednou na soubor; při načtení dalšího souboru rozpracovaný výběr zahodí', async () => {
    const { mpv, sent } = fakeMpv()
    const selector = new TrackSelector(mpv)
    let release: () => void = () => undefined
    selector.reset(
      choices({
        externalSubtitles: () =>
          new Promise((resolve) => {
            release = () => resolve([])
          })
      })
    )
    const first = selector.onFileLoaded()
    void selector.onFileLoaded()
    selector.reset(choices())
    release()
    await first
    expect(sent).toEqual([])

    await selector.onFileLoaded()
    await selector.onFileLoaded()
    expect(sent.filter((c) => c[0] === 'get_property')).toHaveLength(1)
  })
})
