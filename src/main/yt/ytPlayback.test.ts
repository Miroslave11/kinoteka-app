import { describe, expect, it } from 'vitest'
import { ytPlayItem } from './ytPlayback'

const queue = [
  { id: 3, path: 'C:/YT/Města/c.mp4', name: 'C', youtubeId: 'ccccccccccc' },
  { id: 2, path: 'C:/YT/Města/b.mp4', name: 'B', youtubeId: 'bbbbbbbbbbb' },
  { id: 1, path: 'C:/YT/Města/a [aaaaaaaaaaa].ytonline', name: 'A', youtubeId: 'aaaaaaaaaaa' }
]

describe('ytPlayItem', () => {
  it('sousedé v kategorii a pokračování od uložené pozice', () => {
    const item = ytPlayItem(
      {
        queue: () => queue,
        progress: () => ({ position: 80, duration: 200, updatedAt: '' })
      },
      2
    )
    expect(item).toMatchObject({
      path: 'C:/YT/Města/b.mp4',
      title: 'B',
      startSec: 80,
      online: null,
      previous: { id: 3, name: 'C' },
      next: { id: 1, name: 'A' }
    })
  })

  it('bez pozice od začátku; neznámé video null', () => {
    const repo = { queue: () => queue, progress: () => null }
    expect(ytPlayItem(repo, 3)).toMatchObject({ startSec: undefined, previous: null })
    expect(ytPlayItem(repo, 99)).toBeNull()
  })

  it('online video se přehrává podle YouTube ID', () => {
    const repo = { queue: () => queue, progress: () => null }
    expect(ytPlayItem(repo, 1)).toMatchObject({ online: 'aaaaaaaaaaa', next: null })
  })
})
