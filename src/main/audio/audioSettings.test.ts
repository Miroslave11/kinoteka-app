import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO_SETTINGS } from '../../shared/audio'
import { audioLaunchOptions } from './audioSettings'

describe('audioLaunchOptions', () => {
  it('výchozí nastavení: vše passthrough, výběr češtiny a angličtiny podle kódů kontejnerů', () => {
    expect(audioLaunchOptions(DEFAULT_AUDIO_SETTINGS)).toEqual({
      passthroughCodecs: ['ac3', 'eac3', 'truehd', 'dts', 'dts-hd'],
      audioDevice: 'auto',
      audioChannels: 'auto',
      audioLanguages: ['cze', 'ces', 'cs', 'eng', 'en']
    })
  })

  it('PCM 5.1 na zvolené zařízení, DTS bez passthrough', () => {
    expect(
      audioLaunchOptions({
        passthrough: ['ac3', 'eac3'],
        device: 'wasapi/{1234}',
        channels: '5.1',
        languages: ['en']
      })
    ).toEqual({
      passthroughCodecs: ['ac3', 'eac3'],
      audioDevice: 'wasapi/{1234}',
      audioChannels: '5.1,stereo',
      audioLanguages: ['eng', 'en']
    })
  })
})
