import { describe, expect, it } from 'vitest'
import { canResume, parsePlayRequest, progressOutcome, remainingText } from './playback'

describe('progressOutcome', () => {
  it('nad 90 % je zhlédnuto', () => {
    expect(progressOutcome(5400, 6000)).toBe('watched')
    expect(progressOutcome(6000, 6000)).toBe('watched')
  })

  it('mezi minutou a 90 % se pamatuje pozice', () => {
    expect(progressOutcome(60, 6000)).toBe('progress')
    expect(progressOutcome(5399, 6000)).toBe('progress')
  })

  it('krátké nakouknutí nebo neznámá délka rozkoukání smaže', () => {
    expect(progressOutcome(59, 6000)).toBe('clear')
    expect(progressOutcome(300, 0)).toBe('clear')
    expect(progressOutcome(Number.NaN, 6000)).toBe('clear')
  })
})

describe('canResume', () => {
  it('nabídne pokračování jen u rozkoukaného', () => {
    expect(canResume(null)).toBe(false)
    expect(canResume({ position: 1865, duration: 2892, updatedAt: '' })).toBe(true)
    expect(canResume({ position: 30, duration: 2892, updatedAt: '' })).toBe(false)
  })
})

describe('remainingText', () => {
  it('zbývající čas v minutách a hodinách', () => {
    expect(remainingText({ position: 1865, duration: 2705, updatedAt: '' })).toBe('zbývá 14 min')
    expect(remainingText({ position: 600, duration: 4620, updatedAt: '' })).toBe('zbývá 1 h 7 min')
  })
})

describe('parsePlayRequest', () => {
  it('přijme jen platný požadavek', () => {
    expect(parsePlayRequest({ fileId: 3, from: 'resume' })).toEqual({ fileId: 3, from: 'resume' })
    expect(parsePlayRequest({ fileId: 3, from: 'later' })).toBeNull()
    expect(parsePlayRequest({ fileId: '3', from: 'beginning' })).toBeNull()
    expect(parsePlayRequest(3)).toBeNull()
  })
})
