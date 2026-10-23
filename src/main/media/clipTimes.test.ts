import { describe, expect, it } from 'vitest'
import { chooseClipTimes } from './clipTimes'

describe('chooseClipTimes', () => {
  it('film 2 h: tři klipy mezi 15 % a 80 %, mimo úvod a titulky', () => {
    const times = chooseClipTimes(7200)
    expect(times).toEqual([1080, 3416, 5752])
    expect(times.every((t) => t >= 7200 * 0.15 && t + 8 <= 7200 * 0.8)).toBe(true)
  })

  it('díl seriálu 45 min: také tři klipy', () => {
    expect(chooseClipTimes(2700)).toHaveLength(3)
  })

  it('krátké video: klipy se nepřekrývají, méně klipů, velmi krátké žádný', () => {
    const short = chooseClipTimes(90)
    expect(short.every((t, i) => i === 0 || t - short[i - 1]! >= 8)).toBe(true)
    expect(chooseClipTimes(40)).toHaveLength(1)
    expect(chooseClipTimes(20)).toEqual([])
    expect(chooseClipTimes(Number.NaN)).toEqual([])
  })
})
