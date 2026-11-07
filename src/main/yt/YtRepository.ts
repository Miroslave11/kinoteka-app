import type { YtCategory, YtCategoryRole, YtVideoSummary } from '../../shared/yt'
import type { Database } from '../db/database'
import type { StoredFile } from '../library/scanner'
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

  thumbnailPath(id: number): string | null {
    const row = this.db.prepare('SELECT thumbnail FROM yt_video WHERE id = ?').get(id)
    return row?.['thumbnail'] ? String(row['thumbnail']) : null
  }

  /**
   * Kategorie s videi (i prázdné – jsou to složky, do kterých se řadí). Videa, která ještě
   * čekají na zařazení, jsou na konci jako „Čeká na zařazení“.
   */
  list(): YtCategory[] {
    const videos = new Map<number | null, YtVideoSummary[]>()
    const rows = this.db
      .prepare('SELECT id, category_id, name, channel, duration FROM yt_video ORDER BY name')
      .all()
    for (const row of rows) {
      const categoryId = row['category_id'] === null ? null : Number(row['category_id'])
      const video: YtVideoSummary = {
        id: Number(row['id']),
        name: String(row['name']),
        channel: (row['channel'] as string | null) ?? null,
        durationSec: typeof row['duration'] === 'number' ? Math.round(row['duration']) : null
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
}
