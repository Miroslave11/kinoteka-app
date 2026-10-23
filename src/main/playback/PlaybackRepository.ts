import type { TrackPreference } from '../../shared/audio'
import type { TitleMetadata } from '../../shared/metadata'
import {
  EMPTY_WATCH_STATE,
  episodeCode,
  progressOutcome,
  type PlaybackProgress,
  type WatchState
} from '../../shared/playback'
import { transaction, type Database } from '../db/database'

type Row = Record<string, unknown>

/** Co se přehrává: soubor a k němu film nebo díl, ke kterému se ukládá pozice. */
export interface PlaybackItem {
  fileId: number
  path: string
  available: boolean
  titleId: number
  episodeId: number | null
  /** Popis do horní lišty přehrávače („Země gangů · S01E02 · Puzzle“). */
  label: string
  /** U dílu jen „S01E02 · Puzzle“ (tlačítko „Další díl“), u filmu stejné jako label. */
  shortLabel: string
}

/** Klíč stavu sledování: film = „titul:0“, díl = „titul:díl“. */
export const watchKey = (titleId: number, episodeId: number | null): string =>
  `${titleId}:${episodeId ?? 0}`

function parseMetadata(value: unknown): TitleMetadata | null {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as TitleMetadata
  } catch {
    return null
  }
}

function labelsOf(row: Row): { label: string; shortLabel: string } {
  const metadata = parseMetadata(row['metadata'])
  const name = metadata?.name || String(row['title_name'])
  if (row['episode_id'] === null) return { label: name, shortLabel: name }
  const season = Number(row['season'])
  const number = Number(row['episode'])
  const episodeName =
    metadata?.seasons.find((s) => s.number === season)?.episodes.find((e) => e.number === number)
      ?.name ?? (row['episode_name'] as string | null)
  const shortLabel = [episodeCode(season, number), episodeName].filter(Boolean).join(' · ')
  return { label: `${name} · ${shortLabel}`, shortLabel }
}

const ITEM_SELECT = `
  SELECT f.id AS file_id, f.path, f.available, f.title_id, f.episode_id,
         t.name AS title_name, t.metadata, e.season, e.episode, e.name AS episode_name
  FROM media_file f
  JOIN title t ON t.id = f.title_id
  LEFT JOIN episode e ON e.id = f.episode_id`

const toItem = (row: Row): PlaybackItem => ({
  fileId: Number(row['file_id']),
  path: String(row['path']),
  available: row['available'] === 1,
  titleId: Number(row['title_id']),
  episodeId: row['episode_id'] === null ? null : Number(row['episode_id']),
  ...labelsOf(row)
})

/** Pozice rozkoukaných filmů a dílů a záznamy o zhlédnutí. */
export class PlaybackRepository {
  constructor(private readonly db: Database) {}

  itemForFile(fileId: number): PlaybackItem | undefined {
    const row = this.db.prepare(`${ITEM_SELECT} WHERE f.id = ?`).get(fileId)
    return row ? toItem(row) : undefined
  }

  /** Následující díl seriálu, který je na disku a dostupný. */
  nextEpisode(item: PlaybackItem): PlaybackItem | undefined {
    if (item.episodeId === null) return undefined
    const row = this.db
      .prepare(
        `${ITEM_SELECT}
         JOIN episode cur ON cur.id = ?
         WHERE f.title_id = ? AND f.available = 1
           AND (e.season > cur.season OR (e.season = cur.season AND e.episode > cur.episode))
         ORDER BY e.season, e.episode, f.path
         LIMIT 1`
      )
      .get(item.episodeId, item.titleId)
    return row ? toItem(row) : undefined
  }

  progress(titleId: number, episodeId: number | null): PlaybackProgress | null {
    const row = this.db
      .prepare('SELECT * FROM playback_progress WHERE title_id = ? AND episode_id IS ?')
      .get(titleId, episodeId)
    return row
      ? {
          position: Number(row['position']),
          duration: Number(row['duration']),
          updatedAt: String(row['updated_at'])
        }
      : null
  }

  /**
   * Uloží výsledek přehrávání: nad 90 % zapíše zhlédnutí do deníku (a zapomene pozici),
   * jinak pozici, nebo rozkoukání smaže, když se do filmu jen podíval.
   */
  record(
    titleId: number,
    episodeId: number | null,
    position: number,
    duration: number,
    now = new Date()
  ): 'watched' | 'progress' | 'clear' {
    const outcome = progressOutcome(position, duration)
    const timestamp = now.toISOString()
    transaction(this.db, () => {
      this.db
        .prepare('DELETE FROM playback_progress WHERE title_id = ? AND episode_id IS ?')
        .run(titleId, episodeId)
      if (outcome === 'progress') {
        this.db
          .prepare(
            'INSERT INTO playback_progress (title_id, episode_id, position, duration, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(titleId, episodeId, position, duration, timestamp)
      } else if (outcome === 'watched') {
        this.db
          .prepare('INSERT INTO watch_event (title_id, episode_id, watched_at) VALUES (?, ?, ?)')
          .run(titleId, episodeId, timestamp)
      }
    })
    return outcome
  }

  /** Zapamatovaná volba stopy pro film nebo celý seriál. */
  trackPreference(titleId: number, kind: 'audio' | 'sub'): TrackPreference | null {
    const row = this.db
      .prepare('SELECT language, track_title FROM title_track_pref WHERE title_id = ? AND kind = ?')
      .get(titleId, kind)
    return row
      ? {
          language: (row['language'] as string | null) ?? null,
          title: (row['track_title'] as string | null) ?? null
        }
      : null
  }

  saveTrackPreference(titleId: number, kind: 'audio' | 'sub', preference: TrackPreference): void {
    this.db
      .prepare(
        `INSERT INTO title_track_pref (title_id, kind, language, track_title) VALUES (?, ?, ?, ?)
         ON CONFLICT (title_id, kind) DO UPDATE
         SET language = excluded.language, track_title = excluded.track_title`
      )
      .run(titleId, kind, preference.language, preference.title)
  }

  /** Stav sledování všech filmů a dílů pro katalog (klíč z `watchKey`). */
  watchStates(): Map<string, WatchState> {
    const states = new Map<string, WatchState>()
    const get = (row: Row): WatchState => {
      const key = watchKey(Number(row['title_id']), (row['episode_id'] as number | null) ?? null)
      const state = states.get(key) ?? { ...EMPTY_WATCH_STATE }
      states.set(key, state)
      return state
    }
    for (const row of this.db.prepare('SELECT * FROM playback_progress').all()) {
      get(row).progress = {
        position: Number(row['position']),
        duration: Number(row['duration']),
        updatedAt: String(row['updated_at'])
      }
    }
    for (const row of this.db
      .prepare(
        `SELECT title_id, episode_id, COUNT(*) AS count, MAX(watched_at) AS last
         FROM watch_event GROUP BY title_id, IFNULL(episode_id, 0)`
      )
      .all()) {
      const state = get(row)
      state.watchCount = Number(row['count'])
      state.lastWatchedAt = String(row['last'])
    }
    return states
  }
}
