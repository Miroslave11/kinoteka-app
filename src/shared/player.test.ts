import { describe, expect, it } from 'vitest'
import { describeAudioOutput, formatTime, parsePlayerCommand } from './player'

describe('parsePlayerCommand', () => {
  it('přijme platné příkazy', () => {
    expect(parsePlayerCommand({ type: 'toggle-pause' })).toEqual({ type: 'toggle-pause' })
    expect(parsePlayerCommand({ type: 'play-next' })).toEqual({ type: 'play-next' })
    expect(parsePlayerCommand({ type: 'set-audio-track', id: 2 })).toEqual({
      type: 'set-audio-track',
      id: 2
    })
    expect(parsePlayerCommand({ type: 'set-audio-track', id: '2' })).toBeNull()
    expect(parsePlayerCommand({ type: 'set-subtitle-track', id: null })).toEqual({
      type: 'set-subtitle-track',
      id: null
    })
    expect(parsePlayerCommand({ type: 'set-sub-delay', seconds: 1.25 })).toEqual({
      type: 'set-sub-delay',
      seconds: 1.3
    })
    expect(parsePlayerCommand({ type: 'set-sub-delay', seconds: 9999 })).toBeNull()
    expect(parsePlayerCommand({ type: 'load-subtitle' })).toEqual({ type: 'load-subtitle' })
    expect(parsePlayerCommand({ type: 'seek-relative', seconds: -10 })).toEqual({
      type: 'seek-relative',
      seconds: -10
    })
    expect(parsePlayerCommand({ type: 'set-pause', paused: true })).toEqual({
      type: 'set-pause',
      paused: true
    })
  })

  it('omezí hlasitost na 0–100', () => {
    expect(parsePlayerCommand({ type: 'set-volume', volume: 250 })).toEqual({
      type: 'set-volume',
      volume: 100
    })
    expect(parsePlayerCommand({ type: 'set-volume', volume: -5 })).toEqual({
      type: 'set-volume',
      volume: 0
    })
  })

  it('odmítne neznámé nebo poškozené příkazy', () => {
    expect(parsePlayerCommand(null)).toBeNull()
    expect(parsePlayerCommand('toggle-pause')).toBeNull()
    expect(parsePlayerCommand({ type: 'run', cmd: 'calc.exe' })).toBeNull()
    expect(parsePlayerCommand({ type: 'seek-relative', seconds: 'x' })).toBeNull()
    expect(parsePlayerCommand({ type: 'seek-absolute', seconds: -1 })).toBeNull()
    expect(parsePlayerCommand({ type: 'seek-absolute', seconds: Number.NaN })).toBeNull()
  })
})

describe('describeAudioOutput', () => {
  it('pozná passthrough podle výstupního formátu spdif', () => {
    expect(
      describeAudioOutput({ codecName: 'eac3', channelCount: 6, outputFormat: 'spdif-eac3' })
    ).toEqual({ codec: 'E-AC3', channels: '5.1', passthrough: true })
  })

  it('pozná DTS-HD podle výstupního formátu', () => {
    expect(
      describeAudioOutput({ codecName: 'dts', channelCount: 8, outputFormat: 'spdif-dtshd' })
    ).toEqual({ codec: 'DTS-HD', channels: '7.1', passthrough: true })
  })

  it('dekódovaný zvuk není passthrough', () => {
    expect(
      describeAudioOutput({ codecName: 'aac', channelCount: 2, outputFormat: 'floatp' })
    ).toEqual({ codec: 'AAC', channels: '2.0', passthrough: false })
  })

  it('bez zvukové stopy vrátí null', () => {
    expect(describeAudioOutput({ codecName: undefined })).toBeNull()
  })
})

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [75, '1:15'],
    [4354, '1:12:34'],
    [59.9, '0:59'],
    [-3, '0:00'],
    [Number.NaN, '0:00']
  ])('%s s → %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected)
  })
})
