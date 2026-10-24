import { basename } from 'node:path'
import type { KidsTitle, KidsTmdbMatch, KidsTmdbStatus, KidsVideo } from '../../shared/kids'
import {
  canResume,
  progressOutcome,
  progressRatio,
  type PlaybackProgress
} from '../../shared/playback'
import type { Database } from '../db/database'
import type { StoredFile } from '../library/scanner'
import { imageUrl } from '../metadata/mapping'
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
  coverVideoId: number | null
  /** „tmdb:/abc.jpg“ nebo „file:<cesta>“; null = nevybráno. */
  coverImage: string | null
  tmdb: KidsTmdbMatch
  /** Cesty obrázků pořadu na TMDB, nejvhodnější první. */
  artwork: string[]
}

/** Soubor videa v databázi (pro přesun a mazání). */
export interface StoredVideo {
  id: number
  path: string
  titleId: number | null
  size: number
  mtimeMs: number
}

const storedVideo = (row: Row): StoredVideo => ({
  id: Number(row['id']),
  path: String(row['path']),
  titleId: row['title_id'] === null ? null : Number(row['title_id']),
  size: Number(row['size']),
  mtimeMs: Number(row['mtime_ms'])
})

function parseKeywords(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value)) as unknown
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

const TMDB_STATUSES: readonly KidsTmdbStatus[] = ['pending', 'matched', 'manual', 'none', 'off']

const storedTitle = (row: Row): StoredTitle => ({
  id: Number(row['id']),
  folder: String(row['folder']),
  keywords: parseKeywords(row['keywords']),
  coverVideoId: row['cover_video_id'] === null ? null : Number(row['cover_video_id']),
  coverImage: (row['cover_image'] as string | null) ?? null,
  tmdb: {
    status: TMDB_STATUSES.find((s) => s === row['tmdb_status']) ?? 'pending',
    kind: row['tmdb_kind'] === 'tv' || row['tmdb_kind'] === 'movie' ? row['tmdb_kind'] : null,
    id: row['tmdb_id'] === null ? null : Number(row['tmdb_id']),
    name: (row['tmdb_name'] as string | null) ?? null,
    year: row['tmdb_year'] === null ? null : Number(row['tmdb_year'])
  },
  artwork: parseKeywords(row['artwork'])
})

/** Obrázek z TMDB v kolečku – stačí střední velikost. */
export const artworkUrl = (path: string): string | null => imageUrl('w780', path)

/** Vlastní obrázek titulu; „?v=“ podle jména souboru, aby se po výměně nenačetl starý z cache. */
const customCoverUrl = (titleId: number, file: string): string =>
  `kinoteka-media://kids/title/${titleId}?v=${encodeURIComponent(basename(file))}`

const thumbnailUrl = (row: Row): string | null =>
  row['thumbnail']
    ? `kinoteka-media://kids/video/${Number(row['id'])}?v=${Number(row['mtime_ms'])}`
    : null

/** Tituly a videa dětské části. */
export class KidsRepository {
  constructor(private readonly db: Database) {}

  titles(): StoredTitle[] {
    return this.db.prepare('SELECT * FROM kids_title ORDER BY folder').all().map(storedTitle)
  }

  title(id: number): StoredTitle | null {
    return this.titles().find((t) => t.id === id) ?? null
  }

  /** Nový název titulu = nový název podsložky (složku přejmenuje knihovna). */
  renameTitle(id: number, folder: string): void {
    this.db.prepare('UPDATE kids_title SET folder = ? WHERE id = ?').run(folder, id)
    // Pořad vybraný rodičem zůstane, automaticky nalezený se podle nového názvu hledá znovu.
    this.db
      .prepare(
        `UPDATE kids_title SET tmdb_status = 'pending'
         WHERE id = ? AND tmdb_status IN ('matched', 'none')`
      )
      .run(id)
  }

  setKeywords(id: number, keywords: readonly string[]): void {
    this.db
      .prepare('UPDATE kids_title SET keywords = ? WHERE id = ?')
      .run(JSON.stringify(keywords), id)
  }

  /** Obrázek titulu podle vybraného videa; null = vybrat automaticky. */
  setCover(id: number, videoId: number | null): void {
    this.db
      .prepare('UPDATE kids_title SET cover_video_id = ?, cover_image = NULL WHERE id = ?')
      .run(videoId, id)
  }

  /** Obrázek titulu z TMDB („tmdb:/abc.jpg“) nebo ze souboru („file:<cesta>“). */
  setCoverImage(id: number, image: string): void {
    this.db
      .prepare('UPDATE kids_title SET cover_image = ?, cover_video_id = NULL WHERE id = ?')
      .run(image, id)
  }

  /** Vlastní obrázek titulu na disku; null = titul ho nemá. */
  customCoverPath(id: number): string | null {
    const image = this.title(id)?.coverImage
    return image?.startsWith('file:') ? image.slice('file:'.length) : null
  }

  /** Výsledek hledání na TMDB (pořad a jeho obrázky). */
  setTmdb(id: number, match: KidsTmdbMatch, artwork: readonly string[]): void {
    this.db
      .prepare(
        `UPDATE kids_title SET tmdb_status = ?, tmdb_kind = ?, tmdb_id = ?, tmdb_name = ?,
           tmdb_year = ?, artwork = ? WHERE id = ?`
      )
      .run(match.status, match.kind, match.id, match.name, match.year, JSON.stringify(artwork), id)
  }

  /** Pořad se dohledá znovu podle názvu. */
  resetTmdb(id: number): void {
    this.db.prepare(`UPDATE kids_title SET tmdb_status = 'pending' WHERE id = ?`).run(id)
  }

  /** Tituly, ke kterým se ještě nehledal pořad na TMDB. */
  titlesNeedingArtwork(): StoredTitle[] {
    return this.titles().filter((t) => t.tmdb.status === 'pending')
  }

  /** Kanály videí titulu, nejčastější první (další možnost, jak pořad najít). */
  titleChannels(id: number): string[] {
    return this.db
      .prepare(
        `SELECT channel FROM kids_video WHERE title_id = ? AND channel IS NOT NULL
         GROUP BY channel ORDER BY COUNT(*) DESC`
      )
      .all(id)
      .map((row) => String(row['channel']))
  }

  /** Smaže titul i záznamy jeho videí (soubory zahodí knihovna). */
  deleteTitle(id: number): void {
    this.removeVideos(this.titleVideos(id).map((v) => v.id))
    this.db.prepare('DELETE FROM kids_title WHERE id = ?').run(id)
    this.setFavorite('title', id, false)
  }

  titleVideos(titleId: number): StoredVideo[] {
    return this.db
      .prepare('SELECT id, path, title_id, size, mtime_ms FROM kids_video WHERE title_id = ?')
      .all(titleId)
      .map(storedVideo)
  }

  video(id: number): StoredVideo | null {
    const row = this.db
      .prepare('SELECT id, path, title_id, size, mtime_ms FROM kids_video WHERE id = ?')
      .get(id)
    return row ? storedVideo(row) : null
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
      if (!keep.has(title.folder.toLowerCase())) {
        this.db.prepare('DELETE FROM kids_title WHERE id = ?').run(title.id)
        this.setFavorite('title', title.id, false)
      }
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
    for (const id of ids) {
      remove.run(id)
      this.setFavorite('video', id, false)
    }
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
   * jsou na konci jako titul „Ostatní“. Obrázek titulu = vybraný rodičem, jinak obrázek
   * pořadu z TMDB, jinak obrázek nejstaršího videa. Prázdné tituly (bez videí) jen pro správu titulů (`includeEmpty`).
   */
  list({ includeEmpty = false }: { includeEmpty?: boolean } = {}): KidsTitle[] {
    const titles = this.titles()
    const keywordsOf = new Map<number, TitleKeywords>(
      titles.map((t) => [t.id, { name: t.folder, keywords: t.keywords }])
    )
    const favorites = this.favorites()
    const videos = new Map<number | null, KidsVideo[]>()
    const covers = new Map<number | null, string | null>()
    const rows = this.db
      .prepare(
        `SELECT v.*, p.position, p.duration AS progress_duration, p.updated_at AS progress_at,
           w.count AS watch_count, w.last_at AS watched_at
         FROM kids_video v
         LEFT JOIN kids_progress p ON p.video_id = v.id
         LEFT JOIN kids_watch w ON w.video_id = v.id
         ORDER BY v.added_at, v.id`
      )
      .all()
    for (const row of rows) {
      const titleId = row['title_id'] === null ? null : Number(row['title_id'])
      const originalName = String(row['name'])
      const id = Number(row['id'])
      const progress =
        typeof row['position'] === 'number'
          ? { position: row['position'], duration: Number(row['progress_duration']), updatedAt: '' }
          : null
      const video: KidsVideo = {
        id,
        titleId,
        name: cleanVideoName(
          originalName,
          titleId === null ? null : (keywordsOf.get(titleId) ?? null)
        ),
        originalName,
        channel: (row['channel'] as string | null) ?? null,
        durationSec: typeof row['duration'] === 'number' ? Math.round(row['duration']) : null,
        thumbnailUrl: thumbnailUrl(row),
        addedAt: String(row['added_at']),
        progress: canResume(progress) ? progressRatio(progress) : null,
        watched: Number(row['watch_count'] ?? 0) > 0,
        lastPlayedAt:
          [row['progress_at'], row['watched_at']]
            .filter((value): value is string => typeof value === 'string')
            .sort()
            .at(-1) ?? null,
        favorite: favorites.video.has(id)
      }
      if (!covers.get(titleId)) covers.set(titleId, video.thumbnailUrl)
      videos.set(titleId, [...(videos.get(titleId) ?? []), video])
    }
    const result: KidsTitle[] = titles
      .filter((t) => includeEmpty || videos.has(t.id))
      .map((t) => {
        const own = videos.get(t.id) ?? []
        const cover = own.find((v) => v.id === t.coverVideoId && v.thumbnailUrl)
        const artwork = t.tmdb.status === 'off' ? [] : t.artwork
        const tmdbImage = t.coverImage?.startsWith('tmdb:')
          ? t.coverImage.slice('tmdb:'.length)
          : null
        const chosen = t.coverImage?.startsWith('file:')
          ? { image: 'file', url: customCoverUrl(t.id, t.coverImage) }
          : tmdbImage && artworkUrl(tmdbImage)
            ? { image: tmdbImage, url: artworkUrl(tmdbImage)! }
            : null
        return {
          id: t.id,
          name: t.folder,
          keywords: t.keywords,
          coverUrl:
            chosen?.url ??
            cover?.thumbnailUrl ??
            (artwork[0] ? artworkUrl(artwork[0]) : null) ??
            covers.get(t.id) ??
            null,
          coverVideoId: cover ? t.coverVideoId : null,
          coverImage: chosen?.image ?? null,
          artwork: artwork.flatMap((path) => {
            const url = artworkUrl(path)
            return url ? [{ path, url }] : []
          }),
          tmdb: t.tmdb,
          videos: own,
          favorite: favorites.title.has(t.id)
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
    const loose = videos.get(null)
    if (loose)
      result.push({
        id: null,
        name: 'Ostatní',
        keywords: [],
        coverUrl: covers.get(null) ?? null,
        coverVideoId: null,
        coverImage: null,
        artwork: [],
        tmdb: { status: 'off', kind: null, id: null, name: null, year: null },
        videos: loose,
        favorite: false
      })
    return result
  }

  // ---------- přehrávání ----------

  /** Pohádky titulu v pořadí přehrávání (jak přibyly); u nezařazených všechny nezařazené. */
  queue(videoId: number): { id: number; path: string; name: string; thumbnail: boolean }[] {
    const row = this.db.prepare('SELECT title_id FROM kids_video WHERE id = ?').get(videoId)
    if (!row) return []
    return this.db
      .prepare(
        `SELECT id, path, name, thumbnail FROM kids_video WHERE title_id IS ?
         ORDER BY added_at, id`
      )
      .all(row['title_id'] ?? null)
      .map((r) => ({
        id: Number(r['id']),
        path: String(r['path']),
        name: String(r['name']),
        thumbnail: r['thumbnail'] !== null
      }))
  }

  /** Název titulu videa (pro očištění názvu dílu v přehrávači). */
  titleKeywords(videoId: number): TitleKeywords | null {
    const row = this.db
      .prepare(
        `SELECT t.folder, t.keywords FROM kids_video v JOIN kids_title t ON t.id = v.title_id
         WHERE v.id = ?`
      )
      .get(videoId)
    return row ? { name: String(row['folder']), keywords: parseKeywords(row['keywords']) } : null
  }

  progress(videoId: number): PlaybackProgress | null {
    const row = this.db
      .prepare('SELECT position, duration, updated_at FROM kids_progress WHERE video_id = ?')
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
          `INSERT INTO kids_progress (video_id, position, duration, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (video_id) DO UPDATE SET position = excluded.position,
             duration = excluded.duration, updated_at = excluded.updated_at`
        )
        .run(videoId, position, duration, now.toISOString())
      return outcome
    }
    this.db.prepare('DELETE FROM kids_progress WHERE video_id = ?').run(videoId)
    if (outcome === 'watched') {
      this.db
        .prepare(
          `INSERT INTO kids_watch (video_id, count, last_at) VALUES (?, 1, ?)
           ON CONFLICT (video_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at`
        )
        .run(videoId, now.toISOString())
    }
    return outcome
  }

  /** Rozkoukané pohádky, naposledy sledované první. */
  continueWatching(): number[] {
    return this.db
      .prepare('SELECT video_id FROM kids_progress ORDER BY updated_at DESC')
      .all()
      .map((row) => Number(row['video_id']))
  }

  private favorites(): { title: Set<number>; video: Set<number> } {
    const result = { title: new Set<number>(), video: new Set<number>() }
    for (const row of this.db.prepare('SELECT kind, ref_id FROM kids_favorite').all())
      result[row['kind'] === 'title' ? 'title' : 'video'].add(Number(row['ref_id']))
    return result
  }

  isFavorite(kind: 'title' | 'video', id: number): boolean {
    return (
      this.db.prepare('SELECT 1 FROM kids_favorite WHERE kind = ? AND ref_id = ?').get(kind, id) !==
      undefined
    )
  }

  setFavorite(kind: 'title' | 'video', id: number, favorite: boolean, now = new Date()): void {
    if (favorite)
      this.db
        .prepare('INSERT OR IGNORE INTO kids_favorite (kind, ref_id, created_at) VALUES (?, ?, ?)')
        .run(kind, id, now.toISOString())
    else this.db.prepare('DELETE FROM kids_favorite WHERE kind = ? AND ref_id = ?').run(kind, id)
  }
}
