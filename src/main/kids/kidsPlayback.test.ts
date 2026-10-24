import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { SAVE_INTERVAL_MS } from '../playback/PlaybackTracker'
import { KidsTracker, kidsPlayItem, PlayTimeMeter } from './kidsPlayback'
import { KidsRepository } from './KidsRepository'

const ON = { autoplayNext: true, timeLeftSec: null }

let repository: KidsRepository
const ids: number[] = []

/** Titul Prasátko Peppa se třemi pohádkami (přidané postupně) a jedna nezařazená. */
beforeEach(() => {
  repository = new KidsRepository(openDatabase(':memory:'))
  const peppa = repository.ensureTitle('Prasátko Peppa')
  repository.setFavorite('title', peppa, false)
  ids.length = 0
  const add = (name: string, titleId: number | null, day: number, thumbnail: string | null) =>
    repository.insertVideo(
      {
        path: `C:\\Kids\\${name}.mp4`,
        titleId,
        youtubeId: null,
        name,
        channel: null,
        duration: 300,
        thumbnail,
        size: 1,
        mtimeMs: day
      },
      new Date(`2026-10-0${day}T10:00:00Z`)
    )
  ids.push(add('Bláto | Prasátko Peppa', peppa, 1, 'C:\\Kids\\a.jpg'))
  ids.push(add('Prasátko Peppa - Výlet k moři', peppa, 2, null))
  ids.push(add('Narozeniny | Prasátko Peppa', peppa, 3, 'C:\\Kids\\c.jpg'))
  ids.push(add('Domácí video', null, 4, null))
})

describe('kidsPlayItem', () => {
  it('pořadí podle přidání, předchozí a další pohádka s očištěným názvem a obrázkem', () => {
    const item = kidsPlayItem(repository, ids[1]!, ON)!
    expect(item).toMatchObject({
      path: 'C:\\Kids\\Prasátko Peppa - Výlet k moři.mp4',
      title: 'Prasátko Peppa · Výlet k moři',
      previousId: ids[0],
      nextId: ids[2],
      startSec: undefined,
      info: {
        hasPrevious: true,
        next: { name: 'Narozeniny', thumbnailUrl: `kinoteka-media://kids/video/${ids[2]}` },
        autoplayNext: true,
        favorite: false
      }
    })
  })

  it('první a poslední pohádka; nezařazené video bez názvu titulu', () => {
    expect(
      kidsPlayItem(repository, ids[0]!, { autoplayNext: false, timeLeftSec: 0 })!.info
    ).toMatchObject({
      hasPrevious: false,
      autoplayNext: false,
      timeLeftSec: 0,
      limitReached: true
    })
    expect(kidsPlayItem(repository, ids[2]!, ON)!.info.next).toBeNull()
    expect(kidsPlayItem(repository, ids[3]!, ON)).toMatchObject({
      title: 'Domácí video',
      previousId: null,
      nextId: null
    })
    expect(kidsPlayItem(repository, 999, ON)).toBeNull()
  })

  it('rozkoukaná pohádka pokračuje od uložené pozice; srdíčko', () => {
    repository.record(ids[0]!, 120, 300)
    repository.setFavorite('video', ids[0]!, true)
    expect(kidsPlayItem(repository, ids[0]!, ON)).toMatchObject({
      startSec: 120,
      info: { favorite: true }
    })
  })
})

describe('KidsRepository – historie pohádek', () => {
  it('rozkoukání, zhlédnutí (nad 90 %) a oblíbené se promítnou do výpisu', () => {
    repository.record(ids[0]!, 150, 300, new Date('2026-10-24T08:00:00Z'))
    repository.record(ids[1]!, 290, 300, new Date('2026-10-24T09:00:00Z'))
    repository.setFavorite('video', ids[2]!, true)
    repository.setFavorite('title', repository.titles()[0]!.id, true)

    const [peppa] = repository.list()
    expect(peppa!.favorite).toBe(true)
    expect(
      peppa!.videos.map((v) => [v.name, v.progress, v.watched, v.favorite, v.lastPlayedAt])
    ).toEqual([
      ['Bláto', 0.5, false, false, '2026-10-24T08:00:00.000Z'],
      ['Výlet k moři', null, true, false, '2026-10-24T09:00:00.000Z'],
      ['Narozeniny', null, false, true, null]
    ])
    expect(repository.continueWatching()).toEqual([ids[0]])
  })

  it('smazané video zmizí i z oblíbených a historie', () => {
    repository.record(ids[0]!, 150, 300)
    repository.setFavorite('video', ids[0]!, true)
    repository.removeVideos([ids[0]!])
    expect(repository.isFavorite('video', ids[0]!)).toBe(false)
    expect(repository.progress(ids[0]!)).toBeNull()
  })
})

describe('KidsTracker', () => {
  it('ukládá průběžně, zhlédnutí jednou a při zavření poslední pozici', () => {
    let now = 0
    const changed = vi.fn()
    const tracker = new KidsTracker(repository, changed, () => now)
    tracker.start(ids[0]!)

    tracker.update(100, 300)
    expect(repository.progress(ids[0]!)).toBeNull()
    now = SAVE_INTERVAL_MS
    tracker.update(110, 300)
    expect(repository.progress(ids[0]!)).toMatchObject({ position: 110 })

    tracker.update(280, 300)
    tracker.update(290, 300)
    expect(repository.list()[0]!.videos[0]!).toMatchObject({ watched: true, progress: null })
    expect(changed).toHaveBeenCalledTimes(1)

    tracker.finish()
    expect(tracker.current).toBeNull()
    expect(changed).toHaveBeenCalledTimes(2)
  })
})

describe('PlayTimeMeter', () => {
  it('počítá jen čas, kdy se obraz hýbe, a zapisuje po 5 s', () => {
    let now = 0
    const flushed: number[] = []
    const meter = new PlayTimeMeter(
      (seconds) => flushed.push(seconds),
      () => now
    )
    for (let second = 0; second <= 6; second++) {
      now = second * 1000
      meter.update(second)
    }
    expect(flushed).toEqual([5])
    // Pauza: pozice stojí, čas běží.
    now = 60_000
    meter.update(6)
    now = 61_000
    meter.update(7)
    meter.stop()
    expect(flushed).toEqual([5, 2])
  })
})
