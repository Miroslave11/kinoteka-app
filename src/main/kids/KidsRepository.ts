import type { KidsTitle, KidsVideo } from '../../shared/kids'
import type { Database } from '../db/database'
import type { StoredFile } from '../library/scanner'
import { cleanVideoName, type TitleKeywords } from './classify'

type Row = Record<string, unknown>

/** Co se o videu ví ze souboru a z `.info.json`. */
export interface VideoRecord {
  path: string
  titleId: number | null
  youtubeId: string | null
  name: string
  channel: string | null
  duration: number | null
  thumbnail: string | null
  size: number
  mtimeMs: number
}

export interface StoredTitle {
  id: number
  folder: string
  keywords: string[]
}

function parseKeywords(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value)) as unknown
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

const thumbnailUrl = (row: Row): string | null =>
  row['thumbnail']
    ? `kinoteka-media://kids/video/${Number(row['id'])}?v=${Number(row['mtime_ms'])}`
    : null

/** Tituly a videa dětské části. */
export class KidsRepository {
  constructor(private readonly db: Database) {}

  titles(): StoredTitle[] {
    return this.db
      .prepare('SELECT id, folder, keywords FROM kids_title ORDER BY folder')
      .all()
      .map((row) => ({
        id: Number(row['id']),
        folder: String(row['folder']),
        keywords: parseKeywords(row['keywords'])
      }))
  }

  /** Titul pro podsložku – založí ho, pokud ještě není. */
  ensureTitle(folder: string, now = new Date()): number {
    const existing = this.db.prepare('SELECT id FROM kids_title WHERE folder = ?').get(folder)
    if (existing) return Number(existing['id'])
    return Number(
      this.db
        .prepare('INSERT INTO kids_title (folder, created_at) VALUES (?, ?)')
        .run(folder, now.toISOString()).lastInsertRowid
    )
  }

  /** Odebere tituly, jejichž podsložka zmizela z disku. */
  removeTitlesExcept(folders: readonly string[]): void {
    const keep = new Set(folders.map((f) => f.toLowerCase()))
    for (const title of this.titles()) {
      if (!keep.has(title.folder.toLowerCase()))
        this.db.prepare('DELETE FROM kids_title WHERE id = ?').run(title.id)
    }
  }

  storedFiles(): StoredFile[] {
    return this.db
      .prepare('SELECT id, path, size, mtime_ms FROM kids_video')
      .all()
      .map((row) => ({
        id: Number(row['id']),
        path: String(row['path']),
        size: Number(row['size']),
        mtimeMs: Number(row['mtime_ms'])
      }))
  }

  insertVideo(video: VideoRecord, now = new Date()): number {
    return Number(
      this.db
        .prepare(
          `INSERT INTO kids_video (path, title_id, youtube_id, name, channel, duration, thumbnail,
             size, mtime_ms, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          video.path,
          video.titleId,
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

  /** Změněný nebo přesunutý soubor – údaje se načtou znovu, id (a později pozice) zůstane. */
  updateVideo(id: number, video: VideoRecord): void {
    this.db
      .prepare(
        `UPDATE kids_video SET path = ?, title_id = ?, youtube_id = ?, name = ?, channel = ?,
           duration = ?, thumbnail = ?, size = ?, mtime_ms = ? WHERE id = ?`
      )
      .run(
        video.path,
        video.titleId,
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
    const remove = this.db.prepare('DELETE FROM kids_video WHERE id = ?')
    for (const id of ids) remove.run(id)
  }

  /** Videa bez obrázku nebo délky – doplní je ffmpeg/ffprobe. */
  incomplete(): { id: number; path: string; duration: number | null; thumbnail: boolean }[] {
    return this.db
      .prepare(
        'SELECT id, path, duration, thumbnail FROM kids_video WHERE thumbnail IS NULL OR duration IS NULL'
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
    this.db.prepare('UPDATE kids_video SET thumbnail = ? WHERE id = ?').run(path, id)
  }

  setDuration(id: number, duration: number): void {
    this.db.prepare('UPDATE kids_video SET duration = ? WHERE id = ?').run(duration, id)
  }

  videoPath(id: number): string | null {
    const row = this.db.prepare('SELECT path FROM kids_video WHERE id = ?').get(id)
    return row ? String(row['path']) : null
  }

  thumbnailPath(id: number): string | null {
    const row = this.db.prepare('SELECT thumbnail FROM kids_video WHERE id = ?').get(id)
    return row?.['thumbnail'] ? String(row['thumbnail']) : null
  }

  /** Video podle YouTube ID a titul, ve kterém je (null = nezařazené). */
  videoByYoutubeId(youtubeId: string): { id: number; title: string | null } | null {
    const row = this.db
      .prepare(
        `SELECT v.id, t.folder FROM kids_video v LEFT JOIN kids_title t ON t.id = v.title_id
         WHERE v.youtube_id = ? ORDER BY v.id DESC LIMIT 1`
      )
      .get(youtubeId)
    return row ? { id: Number(row['id']), title: (row['folder'] as string | null) ?? null } : null
  }

  /**
   * Tituly s videi (nejnověji přidané video první); videa, která se nepodařilo zařadit,
   * jsou na konci jako titul „Ostatní“. Obrázek titulu = obrázek nejstaršího videa.
   */
  list(): KidsTitle[] {
    const titles = this.titles()
    const keywordsOf = new Map<number, TitleKeywords>(
      titles.map((t) => [t.id, { name: t.folder, keywords: t.keywords }])
    )
    const videos = new Map<number | null, KidsVideo[]>()
    const covers = new Map<number | null, string | null>()
    const rows = this.db.prepare('SELECT * FROM kids_video ORDER BY added_at, id').all()
    for (const row of rows) {
      const titleId = row['title_id'] === null ? null : Number(row['title_id'])
      const originalName = String(row['name'])
      const video: KidsVideo = {
        id: Number(row['id']),
        titleId,
        name: cleanVideoName(
          originalName,
          titleId === null ? null : (keywordsOf.get(titleId) ?? null)
        ),
        originalName,
        channel: (row['channel'] as string | null) ?? null,
        durationSec: typeof row['duration'] === 'number' ? Math.round(row['duration']) : null,
        thumbnailUrl: thumbnailUrl(row),
        addedAt: String(row['added_at'])
      }
      if (!covers.get(titleId)) covers.set(titleId, video.thumbnailUrl)
      videos.set(titleId, [video, ...(videos.get(titleId) ?? [])])
    }
    const result: KidsTitle[] = titles
      .filter((t) => videos.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.folder,
        keywords: t.keywords,
        coverUrl: covers.get(t.id) ?? null,
        videos: videos.get(t.id)!
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
    const loose = videos.get(null)
    if (loose)
      result.push({
        id: null,
        name: 'Ostatní',
        keywords: [],
        coverUrl: covers.get(null) ?? null,
        videos: loose
      })
    return result
  }
}
