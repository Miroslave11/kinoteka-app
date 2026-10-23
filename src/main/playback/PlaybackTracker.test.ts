import { describe, expect, it, vi } from 'vitest'
import type { PlaybackItem, PlaybackRepository } from './PlaybackRepository'
import { PlaybackTracker, SAVE_INTERVAL_MS } from './PlaybackTracker'
import { progressOutcome } from '../../shared/playback'

const item: PlaybackItem = {
  fileId: 1,
  path: 'C:\\Filmy\\a.mkv',
  available: true,
  titleId: 7,
  episodeId: null,
  label: 'Film',
  shortLabel: 'Film'
}

function setup(): {
  tracker: PlaybackTracker
  record: ReturnType<typeof vi.fn>
  changed: ReturnType<typeof vi.fn>
  clock: { now: number }
} {
  const record = vi.fn((_t: number, _e: number | null, position: number, duration: number) =>
    progressOutcome(position, duration)
  )
  const changed = vi.fn()
  const clock = { now: 0 }
  const tracker = new PlaybackTracker(
    { record } as unknown as PlaybackRepository,
    changed,
    () => clock.now
  )
  return { tracker, record, changed, clock }
}

describe('PlaybackTracker', () => {
  it('ukládá pozici nejvýš jednou za interval', () => {
    const { tracker, record, clock } = setup()
    tracker.start(item)
    clock.now = 5_000
    tracker.update(600, 6000)
    expect(record).not.toHaveBeenCalled()
    clock.now = SAVE_INTERVAL_MS
    tracker.update(615, 6000)
    expect(record).toHaveBeenCalledWith(7, null, 615, 6000)
    clock.now = SAVE_INTERVAL_MS + 5_000
    tracker.update(620, 6000)
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('během přehrávání rozkoukání nemaže (první sekundy po spuštění)', () => {
    const { tracker, record, clock } = setup()
    tracker.start(item)
    clock.now = 60_000
    tracker.update(10, 6000)
    expect(record).not.toHaveBeenCalled()
  })

  it('zhlédnutí zapíše hned a jen jednou, při zavření už nic neukládá', () => {
    const { tracker, record, changed } = setup()
    tracker.start(item)
    tracker.update(5500, 6000)
    tracker.update(5600, 6000)
    tracker.finish()
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenLastCalledWith(7, null, 5500, 6000)
    expect(changed).toHaveBeenCalledTimes(2) // zhlédnuto + konec
  })

  it('při zavření uloží poslední pozici i krátké nakouknutí (smazání)', () => {
    const { tracker, record } = setup()
    tracker.start(item)
    tracker.update(20, 6000)
    tracker.finish()
    expect(record).toHaveBeenCalledWith(7, null, 20, 6000)
    tracker.finish()
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('přechod na další díl uloží předchozí', () => {
    const { tracker, record } = setup()
    tracker.start(item)
    tracker.update(1200, 6000)
    tracker.start({ ...item, episodeId: 3 })
    expect(record).toHaveBeenCalledWith(7, null, 1200, 6000)
    expect(tracker.current?.episodeId).toBe(3)
  })
})
