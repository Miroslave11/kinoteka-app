import { progressOutcome } from '../../shared/playback'
import type { PlaybackItem, PlaybackRepository } from './PlaybackRepository'

/** Jak často se během přehrávání ukládá pozice (pro případ pádu nebo vypnutí PC). */
export const SAVE_INTERVAL_MS = 15_000

/**
 * Sleduje pozici právě přehrávaného filmu nebo dílu a ukládá ji. Zhlédnutí (nad 90 %)
 * zapíše hned a jen jednou za přehrání; rozkoukání smaže až při zavření, ne během
 * prvních sekund po spuštění.
 */
export class PlaybackTracker {
  private item: PlaybackItem | null = null
  private position = 0
  private duration = 0
  private lastSavedAt = 0
  private watched = false

  constructor(
    private readonly repository: PlaybackRepository,
    /** Zavolá se, když se změnil stav, který ukazuje knihovna (zhlédnuto, konec přehrávání). */
    private readonly onChanged: () => void,
    private readonly now: () => number = Date.now
  ) {}

  get current(): PlaybackItem | null {
    return this.item
  }

  start(item: PlaybackItem): void {
    this.finish()
    this.item = item
    this.position = 0
    this.duration = 0
    this.watched = false
    this.lastSavedAt = this.now()
  }

  update(position: number, duration: number): void {
    this.position = position
    this.duration = duration
    if (!this.item || this.watched) return
    const outcome = progressOutcome(position, duration)
    if (outcome === 'watched') this.save()
    else if (outcome === 'progress' && this.now() - this.lastSavedAt >= SAVE_INTERVAL_MS) {
      this.save()
    }
  }

  /** Konec přehrávání nebo přechod na jiný díl – uloží poslední pozici. */
  finish(): void {
    if (!this.item) return
    if (!this.watched && this.duration > 0) this.save()
    this.item = null
    this.onChanged()
  }

  /**
   * Tlačítko Zastavit: rozkoukání se smaže (i dřívější) a nic se neuloží – příště
   * se začne od začátku. Zhlédnutí, které se už zapsalo do deníku, zůstane.
   */
  discard(): void {
    if (!this.item) return
    this.repository.clearProgress(this.item.titleId, this.item.episodeId)
    this.item = null
    this.onChanged()
  }

  private save(): void {
    if (!this.item) return
    const outcome = this.repository.record(
      this.item.titleId,
      this.item.episodeId,
      this.position,
      this.duration
    )
    this.lastSavedAt = this.now()
    if (outcome === 'watched') {
      this.watched = true
      this.onChanged()
    }
  }
}
