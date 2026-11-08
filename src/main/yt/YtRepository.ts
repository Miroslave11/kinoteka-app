import {
  canResume,
  progressOutcome,
  progressRatio,
  type PlaybackProgress
} from '../../shared/playback'
import type { YtCategory, YtCategoryRole, YtVideoSummary } from '../../shared/yt'
import type { Database } from '../db/database'
import type { StoredFile } from '../library/scanner'
import { isOnlineFile } from '../library/videoSidecars'
import type { CategoryKeywords } from './ytClassify'

type Row = Record<string, unknown>

/** Co se o videu ví ze souboru a z `.info.json`. */
export interface YtVideoRecord {
  path: string
  categoryId: number | null
  youtubeId: string | null
  name: string
  channel: string | null
  duration: number | null
  thumbnail: string | null
  size: number
  mtimeMs: number
}

export interface StoredCategory extends CategoryKeywords {
  id: number
  folder: string
}

/** Soubor videa v databázi (pro přesun a mazání). */
export interface StoredYtVideo {
  id: number
  path: string
  categoryId: number | null
  youtubeId: string | null
  size: number
  mtimeMs: number
}

const storedVideo = (row: Row): StoredYtVideo => ({
  id: Number(row['id']),
  path: String(row['path']),
  categoryId: row['category_id'] === null ? null : Number(row['category_id']),
  youtubeId: (row['youtube_id'] as string | null) ?? null,
  size: Number(row['size']),
  mtimeMs: Number(row['mtime_ms'])
})

function parseList(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value)) as unknown
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

const parseRole = (value: unknown): YtCategoryRole | null =>
  value === 'music' || value === 'other' ? value : null

const storedCategory = (row: Row): StoredCategory => ({
  id: Number(row['id']),
  folder: String(row['folder']),
  name: String(row['folder']),
  keywords: parseList(row['keywords']),
  role: parseRole(row['role'])
})

/** Kategorie a videa části YT videa. */
export class YtRepository {
  constructor(private readonly db: Database) {}

  /** Kategorie v pořadí založení (výchozí jsou založené v pořadí ze SCOPE). */
  categories(): StoredCategory[] {
    return this.db.prepare('SELECT * FROM yt_category ORDER BY id').all().map(storedCategory)
  }

  category(id: number): StoredCategory | null {
    const row = this.db.prepare('SELECT * FROM yt_category WHERE id = ?').get(id)
    return row ? storedCategory(row) : null
  }

  /** Kategorie pro podsložku – založí ji (s výchozími klíčovými slovy), pokud ještě není. */
  ensureCategory(
    folder: string,
    defaults: { keywords: readonly string[]; role: YtCategoryRole | null } | null,
    now = new Date()
  ): number {
    const existing = this.db.prepare('SELECT id FROM yt_category WHERE folder = ?').get(folder)
    if (existing) return Number(existing['id'])
    return Number(
      this.db
        .prepare('INSERT INTO yt_category (folder, keywords, role, created_at) VALUES (?, ?, ?, ?)')
        .run(
          folder,
          JSON.stringify(defaults?.keywords ?? []),
          defaults?.role ?? null,
          now.toISOString()
        ).lastInsertRowid
    )
  }

  /** Nový název kategorie = nový název podsložky (složku přejmenuje knihovna). */
  renameCategory(id: number, folder: string): void {
    this.db.prepare('UPDATE yt_category SET folder = ? WHERE id = ?').run(folder, id)
  }

  deleteCategory(id: number): void {
    this.db.prepare('DELETE FROM yt_category WHERE id = ?').run(id)
  }

  categoryVideos(categoryId: number): StoredYtVideo[] {
    return this.db
      .prepare(
        'SELECT id, path, category_id, youtube_id, size, mtime_ms FROM yt_video WHERE category_id = ?'
      )
      .all(categoryId)
      .map(storedVideo)
  }

  video(id: number): StoredYtVideo | null {
    const row = this.db
      .prepare(
        'SELECT id, path, category_id, youtube_id, size, mtime_ms FROM yt_video WHERE id = ?'
      )
      .get(id)
    return row ? storedVideo(row) : null
  }

  setKeywords(id: number, keywords: readonly string[]): void {
    this.db
      .prepare('UPDATE yt_category SET keywords = ? WHERE id = ?')
      .run(JSON.stringify(keywords), id)
  }

  /** Odebere kategorie, jejichž podsložka zmizela z disku. */
  removeCategoriesExcept(folders: readonly string[]): void {
    const keep = new Set(folders.map((f) => f.toLowerCase()))
    const remove = this.db.prepare('DELETE FROM yt_category WHERE id = ?')
    for (const category of this.categories())
      if (!keep.has(category.folder.toLowerCase())) remove.run(category.id)
  }

  storedFiles(): StoredFile[] {
    return this.db
      .prepare('SELECT id, path, size, mtime_ms FROM yt_video')
      .all()
      .map((row) => ({
        id: Number(row['id']),
        path: String(row['path']),
        size: Number(row['size']),
        mtimeMs: Number(row['mtime_ms'])
      }))
  }

  insertVideo(video: YtVideoRecord, now = new Date()): number {
    return Number(
      this.db
        .prepare(
          `INSERT INTO yt_video (path, category_id, youtube_id, name, channel, duration, thumbnail,
             size, mtime_ms, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          video.path,
          video.categoryId,
          video.youtubeId,
          video.name,
          video.channel,
          video.duration,
          video.thumbnail,
          video.size,
          video.mtimeMs,
          now.toISOString()
        ).lastInsertRowid
    )
  }

  /** Změněný nebo přesunutý soubor – údaje se načtou znovu, id zůstane. */
  updateVideo(id: number, video: YtVideoRecord): void {
    this.db
      .prepare(
        `UPDATE yt_video SET path = ?, category_id = ?, youtube_id = ?, name = ?, channel = ?,
           duration = ?, thumbnail = ?, size = ?, mtime_ms = ? WHERE id = ?`
      )
      .run(
        video.path,
        video.categoryId,
        video.youtubeId,
        video.name,
        video.channel,
        video.duration,
        video.thumbnail,
        video.size,
        video.mtimeMs,
        id
      )
  }

  removeVideos(ids: readonly number[]): void {
    const remove = this.db.prepare('DELETE FROM yt_video WHERE id = ?')
    for (const id of ids) remove.run(id)
  }

  /** Videa bez obrázku nebo délky – doplní je ffmpeg/ffprobe. */
  incomplete(): { id: number; path: string; duration: number | null; thumbnail: boolean }[] {
    return this.db
      .prepare(
        'SELECT id, path, duration, thumbnail FROM yt_video WHERE thumbnail IS NULL OR duration IS NULL'
      )
      .all()
      .map((row) => ({
        id: Number(row['id']),
        path: String(row['path']),
        duration: typeof row['duration'] === 'number' ? row['duration'] : null,
        thumbnail: row['thumbnail'] !== null
      }))
  }

  setThumbnail(id: number, path: string): void {
    this.db.prepare('UPDATE yt_video SET thumbnail = ? WHERE id = ?').run(path, id)
  }

  setDuration(id: number, duration: number): void {
    this.db.prepare('UPDATE yt_video SET duration = ? WHERE id = ?').run(duration, id)
  }

  /**
   * Kategorie, ve které už video z YouTube je (stažené nebo online); null = ještě ho nemáš.
   * `downloadedOnly` = jen stažená (online video jde ještě stáhnout).
   */
  categoryOfYoutubeId(youtubeId: string, downloadedOnly = false): string | null {
    const row = this.db
      .prepare(
        `SELECT c.folder FROM yt_video v LEFT JOIN yt_category c ON c.id = v.category_id
         WHERE v.youtube_id = ? ${downloadedOnly ? "AND v.path NOT LIKE '%.ytonline'" : ''}
         ORDER BY v.id DESC LIMIT 1`
      )
      .get(youtubeId)
    if (!row) return null
    return (row['folder'] as string | null) ?? 'Čeká na zařazení'
  }

  setUnavailable(id: number, unavailable: boolean): void {
    this.db.prepare('UPDATE yt_video SET unavailable = ? WHERE id = ?').run(unavailable ? 1 : 0, id)
  }

  thumbnailPath(id: number): string | null {
    const row = this.db.prepare('SELECT thumbnail FROM yt_video WHERE id = ?').get(id)
    return row?.['thumbnail'] ? String(row['thumbnail']) : null
  }

  /**
   * Kategorie s videi (i prázdné – jsou to složky, do kterých se řadí), videa nejnovější
   * první. Videa, která ještě čekají na zařazení, jsou na konci jako „Čeká na zařazení“.
   */
  list(): YtCategory[] {
    const videos = new Map<number | null, YtVideoSummary[]>()
    const rows = this.db
      .prepare(
        `SELECT v.*, p.position, p.duration AS progress_duration, p.updated_at AS progress_at,
           w.count AS watch_count, w.last_at AS watched_at
         FROM yt_video v
         LEFT JOIN yt_progress p ON p.video_id = v.id
         LEFT JOIN yt_watch w ON w.video_id = v.id
         ORDER BY v.added_at DESC, v.id DESC`
      )
      .all()
    for (const row of rows) {
      const categoryId = row['category_id'] === null ? null : Number(row['category_id'])
      const id = Number(row['id'])
      const progress =
        typeof row['position'] === 'number'
          ? { position: row['position'], duration: Number(row['progress_duration']), updatedAt: '' }
          : null
      const video: YtVideoSummary = {
        id,
        name: String(row['name']),
        channel: (row['channel'] as string | null) ?? null,
        durationSec: typeof row['duration'] === 'number' ? Math.round(row['duration']) : null,
        youtubeId: (row['youtube_id'] as string | null) ?? null,
        online: isOnlineFile(String(row['path'])),
        sizeBytes: isOnlineFile(String(row['path'])) ? 0 : Number(row['size']),
        unavailable: Number(row['unavailable'] ?? 0) === 1,
        thumbnailUrl: row['thumbnail']
          ? `kinoteka-media://yt/video/${id}?v=${Number(row['mtime_ms'])}`
          : null,
        addedAt: String(row['added_at']),
        progress: canResume(progress) ? progressRatio(progress) : null,
        watched: Number(row['watch_count'] ?? 0) > 0,
        lastPlayedAt:
          [row['progress_at'], row['watched_at']]
            .filter((value): value is string => typeof value === 'string')
            .sort()
            .at(-1) ?? null
      }
      videos.set(categoryId, [...(videos.get(categoryId) ?? []), video])
    }
    const result: YtCategory[] = this.categories().map((c) => ({
      id: c.id,
      name: c.folder,
      keywords: c.keywords,
      role: c.role,
      videos: videos.get(c.id) ?? []
    }))
    const waiting = videos.get(null)
    if (waiting)
      result.push({ id: null, name: 'Čeká na zařazení', keywords: [], role: null, videos: waiting })
    return result
  }

  // ---------- přehrávání ----------

  /** Videa kategorie v pořadí na stránce (nejnovější první) – pro „předchozí / další“. */
  queue(videoId: number): { id: number; path: string; name: string; youtubeId: string | null }[] {
    const row = this.db.prepare('SELECT category_id FROM yt_video WHERE id = ?').get(videoId)
    if (!row) return []
    return this.db
      .prepare(
        `SELECT id, path, name, youtube_id FROM yt_video WHERE category_id IS ?
         ORDER BY added_at DESC, id DESC`
      )
      .all(row['category_id'] ?? null)
      .map((r) => ({
        id: Number(r['id']),
        path: String(r['path']),
        name: String(r['name']),
        youtubeId: (r['youtube_id'] as string | null) ?? null
      }))
  }

  progress(videoId: number): PlaybackProgress | null {
    const row = this.db
      .prepare('SELECT position, duration, updated_at FROM yt_progress WHERE video_id = ?')
      .get(videoId)
    return row
      ? {
          position: Number(row['position']),
          duration: Number(row['duration']),
          updatedAt: String(row['updated_at'])
        }
      : null
  }

  /** Uloží pozici; nad 90 % zapíše zhlédnutí a rozkoukání smaže. */
  record(
    videoId: number,
    position: number,
    duration: number,
    now = new Date()
  ): 'watched' | 'progress' | 'clear' {
    const outcome = progressOutcome(position, duration)
    if (outcome === 'progress') {
      this.db
        .prepare(
          `INSERT INTO yt_progress (video_id, position, duration, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (video_id) DO UPDATE SET position = excluded.position,
             duration = excluded.duration, updated_at = excluded.updated_at`
        )
        .run(videoId, position, duration, now.toISOString())
      return outcome
    }
    this.clearProgress(videoId)
    if (outcome === 'watched') {
      this.db
        .prepare(
          `INSERT INTO yt_watch (video_id, count, last_at) VALUES (?, 1, ?)
           ON CONFLICT (video_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at`
        )
        .run(videoId, now.toISOString())
    }
    return outcome
  }

  /** Zastavení (■): rozkoukání pryč, příště od začátku. */
  clearProgress(videoId: number): void {
    this.db.prepare('DELETE FROM yt_progress WHERE video_id = ?').run(videoId)
  }
}
