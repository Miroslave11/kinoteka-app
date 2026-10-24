import { canResume, progressOutcome } from '../../shared/playback'
import type { KidsPlayerInfo } from '../../shared/player'
import { SAVE_INTERVAL_MS } from '../playback/PlaybackTracker'
import { cleanVideoName } from './classify'
import type { KidsRepository } from './KidsRepository'

/** Co potřebuje přehrávač k pohádce: soubor, název, odkud začít, sousedé v titulu. */
export interface KidsPlayItem {
  videoId: number
  path: string
  title: string
  /** Rozkoukaná pohádka pokračuje sama (dítě se nemá na co ptát). */
  startSec?: number
  previousId: number | null
  nextId: number | null
  info: KidsPlayerInfo
}

export function kidsPlayItem(
  repository: KidsRepository,
  videoId: number,
  options: { autoplayNext: boolean; timeLeftSec: number | null }
): KidsPlayItem | null {
  const queue = repository.queue(videoId)
  const index = queue.findIndex((video) => video.id === videoId)
  const current = queue[index]
  if (!current) return null
  const show = repository.titleKeywords(videoId)
  const name = (video: { name: string }): string => cleanVideoName(video.name, show)
  const previous = queue[index - 1] ?? null
  const next = queue[index + 1] ?? null
  const progress = repository.progress(videoId)
  return {
    videoId,
    path: current.path,
    title: show ? `${show.name} · ${name(current)}` : name(current),
    startSec: canResume(progress) ? progress.position : undefined,
    previousId: previous?.id ?? null,
    nextId: next?.id ?? null,
    info: {
      hasPrevious: previous !== null,
      next: next
        ? {
            name: name(next),
            thumbnailUrl: next.thumbnail ? `kinoteka-media://kids/video/${next.id}` : null
          }
        : null,
      autoplayNext: options.autoplayNext,
      favorite: repository.isFavorite('video', videoId),
      timeLeftSec: options.timeLeftSec,
      limitReached: options.timeLeftSec === 0
    }
  }
}

/**
 * Pozice právě přehrávané pohádky – stejná pravidla jako u filmů (nad 90 % zhlédnuto,
 * průběžně každých 15 s), ale do vlastních tabulek, ne do deníku dospělých.
 */
export class KidsTracker {
  private videoId: number | null = null
  private position = 0
  private duration = 0
  private lastSavedAt = 0
  private watched = false

  constructor(
    private readonly repository: Pick<KidsRepository, 'record'>,
    private readonly onChanged: () => void,
    private readonly now: () => number = Date.now
  ) {}

  get current(): number | null {
    return this.videoId
  }

  start(videoId: number): void {
    this.finish()
    this.videoId = videoId
    this.position = 0
    this.duration = 0
    this.watched = false
    this.lastSavedAt = this.now()
  }

  update(position: number, duration: number): void {
    this.position = position
    this.duration = duration
    if (this.videoId === null || this.watched) return
    const outcome = progressOutcome(position, duration)
    if (outcome === 'watched') this.save()
    else if (outcome === 'progress' && this.now() - this.lastSavedAt >= SAVE_INTERVAL_MS)
      this.save()
  }

  finish(): void {
    if (this.videoId === null) return
    if (!this.watched && this.duration > 0) this.save()
    this.videoId = null
    this.onChanged()
  }

  private save(): void {
    if (this.videoId === null) return
    const outcome = this.repository.record(this.videoId, this.position, this.duration)
    this.lastSavedAt = this.now()
    if (outcome === 'watched') {
      this.watched = true
      this.onChanged()
    }
  }
}

/**
 * Měří, jak dlouho se pohádky opravdu sledují (pro denní limit): počítá se jen čas,
 * kdy se obraz hýbe, a do nastavení se zapisuje po kouscích.
 */
export class PlayTimeMeter {
  private lastWall: number | null = null
  private lastPosition = 0
  private pending = 0

  constructor(
    private readonly flush: (seconds: number) => void,
    private readonly now: () => number = Date.now,
    private readonly flushEverySec = 5
  ) {}

  update(position: number): void {
    const wall = this.now()
    // Pauza nebo posun zpět se nepočítá; výpadek událostí nanejvýš 2 s.
    if (this.lastWall !== null && position > this.lastPosition)
      this.pending += Math.min(2, (wall - this.lastWall) / 1000)
    this.lastWall = wall
    this.lastPosition = position
    if (this.pending >= this.flushEverySec) this.stop()
  }

  /** Konec přehrávání – zapíše zbytek. */
  stop(): void {
    if (this.pending > 0) this.flush(this.pending)
    this.pending = 0
  }

  /** Další pohádka – pozice začíná znovu od nuly. */
  restart(): void {
    this.stop()
    this.lastWall = null
    this.lastPosition = 0
  }
}
