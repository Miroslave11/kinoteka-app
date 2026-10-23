/** Rozkoukaný film nebo díl. */
export interface PlaybackProgress {
  /** Pozice v sekundách. */
  position: number
  /** Délka v sekundách. */
  duration: number
  /** ISO čas posledního uložení. */
  updatedAt: string
}

/** Stav sledování filmu nebo dílu. */
export interface WatchState {
  progress: PlaybackProgress | null
  /** Kolikrát byl zhlédnutý (záznamy v deníku). */
  watchCount: number
  /** ISO čas posledního zhlédnutí. */
  lastWatchedAt: string | null
}

export const EMPTY_WATCH_STATE: WatchState = { progress: null, watchCount: 0, lastWatchedAt: null }

/** Od jakého podílu délky se film počítá jako zhlédnutý. */
export const WATCHED_RATIO = 0.9
/** Kratší rozkoukání se nepamatuje (jen se do filmu podíval). */
export const RESUME_MIN_SECONDS = 60

/** Co uložit po přehrávání: zhlédnuto, pozice, nebo zapomenout rozkoukání. */
export function progressOutcome(
  position: number,
  duration: number
): 'watched' | 'progress' | 'clear' {
  if (!(duration > 0) || !(position >= 0)) return 'clear'
  if (position >= duration * WATCHED_RATIO) return 'watched'
  return position >= RESUME_MIN_SECONDS ? 'progress' : 'clear'
}

/** Nabídnout „Pokračovat od…“? */
export const canResume = (progress: PlaybackProgress | null): progress is PlaybackProgress =>
  progress !== null && progressOutcome(progress.position, progress.duration) === 'progress'

export const progressRatio = (progress: PlaybackProgress): number =>
  progress.duration > 0 ? Math.min(1, Math.max(0, progress.position / progress.duration)) : 0

/** 840 → „zbývá 14 min“, 4000 → „zbývá 1 h 7 min“. */
export function remainingText(progress: PlaybackProgress): string {
  const minutes = Math.max(1, Math.round((progress.duration - progress.position) / 60))
  return minutes >= 60
    ? `zbývá ${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `zbývá ${minutes} min`
}

export type StartFrom = 'resume' | 'beginning'

/** Jak spustit přehrávání souboru z knihovny. */
export interface PlayRequest {
  fileId: number
  /** Pokračovat z uložené pozice, nebo od začátku. */
  from: StartFrom
}

export function parsePlayRequest(value: unknown): PlayRequest | null {
  if (typeof value !== 'object' || value === null) return null
  const { fileId, from } = value as Record<string, unknown>
  if (!Number.isInteger(fileId)) return null
  if (from !== 'resume' && from !== 'beginning') return null
  return { fileId: fileId as number, from }
}

/** „S01E03“ */
export const episodeCode = (season: number, episode: number): string =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
