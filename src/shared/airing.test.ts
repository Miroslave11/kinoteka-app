import { describe, expect, it } from 'vitest'
import {
  airDateText,
  localDate,
  relativeDay,
  upcomingOf,
  upcomingShort,
  upcomingText
} from './airing'
import type { ShowAiring, TitleMetadata } from './metadata'

const show = (airing: ShowAiring | undefined, airDates: Record<string, string | null> = {}) =>
  ({
    kind: 'show',
    airing,
    seasons: [1, 2, 3].map((number) => ({
      number,
      name: `Série ${number}`,
      episodes: Object.entries(airDates)
        .filter(([code]) => code.startsWith(`${number}x`))
        .map(([code, airDate]) => ({
          number: Number(code.split('x')[1]),
          name: `Díl ${code}`,
          overview: null,
          stillUrl: null,
          airDate,
          runtimeMin: null
        }))
    }))
  }) as unknown as TitleMetadata

const TODAY = '2026-10-24'

describe('upcomingOf', () => {
  it('ohlášený příští díl', () => {
    const next = { season: 2, episode: 5, name: 'Návrat', airDate: '2026-10-31' }
    expect(upcomingOf(show({ status: 'running', nextEpisode: next }), TODAY)).toEqual({
      kind: 'episode',
      episode: next
    })
  })

  it('první díl série = začátek nové série, i jen ze seznamu dílů', () => {
    expect(
      upcomingOf(
        show(
          { status: 'running', nextEpisode: null },
          { '2x8': '2026-01-01', '3x1': '2027-03-12', '3x2': '2027-03-19' }
        ),
        TODAY
      )
    ).toEqual({
      kind: 'season',
      episode: { season: 3, episode: 1, name: 'Díl 3x1', airDate: '2027-03-12' }
    })
  })

  it('dnešní díl se počítá, už odvysílaný ne', () => {
    const aired = { season: 1, episode: 4, name: null, airDate: '2026-10-23' }
    expect(
      upcomingOf(show({ status: 'running', nextEpisode: aired }, { '1x5': TODAY }), TODAY)
    ).toMatchObject({ kind: 'episode', episode: { episode: 5, airDate: TODAY } })
    expect(upcomingOf(show({ status: 'running', nextEpisode: aired }), TODAY)).toEqual({
      kind: 'unknown'
    })
  })

  it('skončený a zrušený seriál; bez údajů nic', () => {
    expect(upcomingOf(show({ status: 'ended', nextEpisode: null }), TODAY)).toEqual({
      kind: 'ended'
    })
    expect(upcomingOf(show({ status: 'canceled', nextEpisode: null }), TODAY)).toEqual({
      kind: 'canceled'
    })
    expect(upcomingOf(show(undefined), TODAY)).toBeNull()
    expect(upcomingOf(null, TODAY)).toBeNull()
  })
})

describe('texty', () => {
  it('relativní den se skloňováním', () => {
    expect(relativeDay(TODAY, TODAY)).toBe('dnes')
    expect(relativeDay('2026-10-25', TODAY)).toBe('zítra')
    expect(relativeDay('2026-10-27', TODAY)).toBe('za 3 dny')
    expect(relativeDay('2026-11-05', TODAY)).toBe('za 12 dní')
    // Přes změnu letního času (25. 10. 2026).
    expect(relativeDay('2026-10-31', TODAY)).toBe('za 7 dní')
  })

  it('datum s dnem v týdnu', () => {
    expect(airDateText('2026-10-31', TODAY)).toBe('v sobotu 31. 10. 2026 (za 7 dní)')
  })

  it('věty pro detail seriálu', () => {
    expect(
      upcomingText(
        {
          kind: 'episode',
          episode: { season: 2, episode: 5, name: 'Návrat', airDate: '2026-10-25' }
        },
        TODAY
      )
    ).toBe('Další díl S02E05 „Návrat“ vyjde v neděli 25. 10. 2026 (zítra)')
    expect(
      upcomingText(
        { kind: 'season', episode: { season: 3, episode: 1, name: null, airDate: '2026-10-24' } },
        TODAY
      )
    ).toBe('Série 3 začne v sobotu 24. 10. 2026 (dnes)')
    expect(upcomingText({ kind: 'ended' }, TODAY)).toBe('Seriál skončil')
  })

  it('krátký text pod plakát', () => {
    const ep = (season: number, episode: number, airDate: string) => ({
      season,
      episode,
      name: null,
      airDate
    })
    expect(upcomingShort(ep(2, 5, '2026-10-25'), TODAY)).toBe('S02E05 · zítra')
    expect(upcomingShort(ep(2, 5, '2026-10-31'), TODAY)).toBe('S02E05 · 31. 10.')
    expect(upcomingShort(ep(3, 1, '2027-03-12'), TODAY)).toBe('Série 3 · 12. 3. 2027')
  })

  it('dnešek v místním čase', () => {
    expect(localDate(new Date(2026, 9, 24, 23, 30))).toBe('2026-10-24')
  })
})
