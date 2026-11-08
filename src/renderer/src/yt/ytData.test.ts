import { describe, expect, it } from 'vitest'
import type { YtCategory, YtVideoSummary } from '../../../shared/yt'
import {
  continueRow,
  filterKey,
  filterStorage,
  parseStorage,
  totalVideos,
  visibleCategories
} from './ytData'

const video = (id: number, patch: Partial<YtVideoSummary> = {}): YtVideoSummary => ({
  id,
  name: `Video ${id}`,
  channel: null,
  durationSec: 200,
  youtubeId: null,
  online: false,
  thumbnailUrl: null,
  addedAt: '2026-11-07T10:00:00.000Z',
  progress: null,
  watched: false,
  lastPlayedAt: null,
  ...patch
})

const categories: YtCategory[] = [
  {
    id: 1,
    name: 'Města',
    keywords: [],
    role: null,
    videos: [video(1, { progress: 0.3, lastPlayedAt: '2026-11-07T08:00:00Z' }), video(2)]
  },
  { id: 2, name: 'Příroda', keywords: [], role: null, videos: [] },
  {
    id: null,
    name: 'Čeká na zařazení',
    keywords: [],
    role: null,
    videos: [video(3, { progress: 0.5, lastPlayedAt: '2026-11-07T09:00:00Z' })]
  }
]

describe('ytData', () => {
  it('prázdné kategorie skryje', () => {
    expect(visibleCategories(categories).map((c) => c.name)).toEqual(['Města', 'Čeká na zařazení'])
  })

  it('Pokračovat: rozkoukaná videa, naposledy hraná první, s názvem kategorie', () => {
    expect(continueRow(categories).map((v) => [v.id, v.categoryName])).toEqual([
      [3, 'Čeká na zařazení'],
      [1, 'Města']
    ])
  })

  it('klíč filtru a počet videí', () => {
    expect(categories.map(filterKey)).toEqual(['1', '2', 'ceka'])
    expect(totalVideos(categories)).toBe(3)
  })
})

describe('filtr uložení', () => {
  it('online / v počítači / vše', () => {
    const mixed: YtCategory[] = [
      {
        id: 1,
        name: 'Města',
        keywords: [],
        role: null,
        videos: [video(1, { online: true }), video(2)]
      }
    ]
    expect(totalVideos(filterStorage(mixed, 'online'))).toBe(1)
    expect(filterStorage(mixed, 'pc')[0]!.videos.map((v) => v.id)).toEqual([2])
    expect(totalVideos(filterStorage(mixed, 'vse'))).toBe(2)
    expect([parseStorage('online'), parseStorage('x'), parseStorage(null)]).toEqual([
      'online',
      'vse',
      'vse'
    ])
  })
})
