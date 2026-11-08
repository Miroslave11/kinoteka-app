import { normalizeTitle } from '../catalog/naming'
import type { Database } from '../db/database'
import type { SyncAdapter, SyncEntity } from './syncModel'

/**
 * Sdílení deníku a hodnocení. Titul se mezi počítači pozná podle TMDB ID, jinak podle
 * názvu a roku; díl podle čísla řady a dílu. Titul, který druhý počítač v knihovně nemá,
 * se založí bez souborů (v deníku „není v knihovně“, stejně jako smazaný film).
 */

export interface TitleRef {
  kind: 'movie' | 'show'
  tmdbId: number | null
  name: string
  year: number | null
}

export interface DiaryData {
  title: TitleRef
  episode: { season: number; episode: number } | null
  watchedAt: string
  source: 'auto' | 'manual'
  note: string | null
}

export interface RatingData {
  title: TitleRef
  rating: number
}

export const DIARY_PREFIX = 'denik:'
export const RATING_PREFIX = 'hodnoceni:'

/** Klíč titulu nezávislý na počítači. */
export function titleRefKey(ref: TitleRef): string {
  if (ref.tmdbId !== null) return `${ref.kind}:tmdb:${ref.tmdbId}`
  return `${ref.kind}:${normalizeTitle(ref.name)}|${ref.year ?? ''}`
}

/** Klíč skupiny souborů, jak ho tvoří knihovna (film: název|rok, seriál: název). */
const groupKeyOf = (ref: TitleRef): string =>
  ref.kind === 'movie' ? `${normalizeTitle(ref.name)}|${ref.year ?? ''}` : normalizeTitle(ref.name)

type Row = Record<string, unknown>

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function refOf(row: Row): TitleRef {
  const kind = row['kind'] === 'show' ? 'show' : 'movie'
  return {
    kind,
    tmdbId: num(row['tmdb_id']),
    name: String(row['meta_name'] || row['name']),
    year: num(row['meta_year']) ?? num(row['year'])
  }
}

const TITLE_COLUMNS = `t.kind, t.name, t.year, t.tmdb_id,
  json_extract(t.metadata, '$.name') AS meta_name, json_extract(t.metadata, '$.year') AS meta_year`

export class JournalSync {
  constructor(private readonly db: Database) {}

  readonly diary: SyncAdapter = {
    prefix: DIARY_PREFIX,
    snapshot: () =>
      new Map(
        this.db
          .prepare(
            `SELECT w.sync_id, w.watched_at, w.source, w.note, e.season, e.episode, ${TITLE_COLUMNS}
             FROM watch_event w
             JOIN title t ON t.id = w.title_id
             LEFT JOIN episode e ON e.id = w.episode_id
             WHERE w.sync_id IS NOT NULL`
          )
          .all()
          .map((row): [string, DiaryData] => [
            `${DIARY_PREFIX}${String(row['sync_id'])}`,
            {
              title: refOf(row),
              episode:
                row['season'] === null || row['season'] === undefined
                  ? null
                  : { season: Number(row['season']), episode: Number(row['episode']) },
              watchedAt: String(row['watched_at']),
              source: row['source'] === 'manual' ? 'manual' : 'auto',
              note: (row['note'] as string | null) ?? null
            }
          ])
      ),
    apply: (entity) => this.applyDiary(entity),
    prepare: (keys) => {
      this.remoteKeys = keys
    }
  }

  /** Záznamy deníku, které už mají jiné počítače (ty se neslučují). */
  private remoteKeys: ReadonlySet<string> = new Set()

  readonly ratings: SyncAdapter = {
    prefix: RATING_PREFIX,
    snapshot: () =>
      new Map(
        this.db
          .prepare(
            `SELECT r.rating, ${TITLE_COLUMNS} FROM title_rating r JOIN title t ON t.id = r.title_id`
          )
          .all()
          .map((row): [string, RatingData] => {
            const title = refOf(row)
            return [
              `${RATING_PREFIX}${titleRefKey(title)}`,
              { title, rating: Number(row['rating']) }
            ]
          })
      ),
    apply: (entity) => this.applyRating(entity)
  }

  private applyDiary(entity: SyncEntity): void {
    const syncId = entity.key.slice(DIARY_PREFIX.length)
    if (entity.deleted) {
      this.db.prepare('DELETE FROM watch_event WHERE sync_id = ?').run(syncId)
      return
    }
    const data = entity.data as DiaryData
    const titleId = this.resolveTitle(data.title)
    const episodeId = data.episode ? this.resolveEpisode(titleId, data.episode) : null
    const updated = this.db
      .prepare(
        'UPDATE watch_event SET title_id = ?, episode_id = ?, watched_at = ?, source = ?, note = ? WHERE sync_id = ?'
      )
      .run(titleId, episodeId, data.watchedAt, data.source, data.note, syncId)
    if (Number(updated.changes) > 0) return
    // První synchronizace: totéž zhlédnutí (titul, díl, den) zapsané na obou počítačích –
    // místní záznam, který ostatní ještě nemají, převezme ID z druhého PC (žádný duplikát).
    const twin = this.db
      .prepare(
        `SELECT id, sync_id FROM watch_event
         WHERE title_id = ? AND episode_id IS ? AND substr(watched_at, 1, 10) = substr(?, 1, 10)
         ORDER BY id`
      )
      .all(titleId, episodeId, data.watchedAt)
      .find((row) => !this.remoteKeys.has(`${DIARY_PREFIX}${String(row['sync_id'])}`))
    if (twin) {
      this.db
        .prepare(
          'UPDATE watch_event SET sync_id = ?, watched_at = ?, source = ?, note = COALESCE(?, note) WHERE id = ?'
        )
        .run(syncId, data.watchedAt, data.source, data.note, twin['id'])
      return
    }
    this.db
      .prepare(
        'INSERT INTO watch_event (title_id, episode_id, watched_at, source, note, sync_id) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(titleId, episodeId, data.watchedAt, data.source, data.note, syncId)
  }

  private applyRating(entity: SyncEntity): void {
    const data = entity.data as RatingData
    const titleId = this.resolveTitle(data.title, !entity.deleted)
    if (titleId === null) return
    if (entity.deleted) {
      this.db.prepare('DELETE FROM title_rating WHERE title_id = ?').run(titleId)
      return
    }
    this.db
      .prepare(
        `INSERT INTO title_rating (title_id, rating, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (title_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`
      )
      .run(titleId, data.rating, entity.updatedAt)
  }

  /** Titul v tomto počítači podle TMDB ID, jinak podle názvu a roku; chybějící založí. */
  resolveTitle(ref: TitleRef, create?: true): number
  resolveTitle(ref: TitleRef, create: boolean): number | null
  resolveTitle(ref: TitleRef, create = true): number | null {
    if (ref.tmdbId !== null) {
      const byTmdb = this.db
        .prepare('SELECT id FROM title WHERE kind = ? AND tmdb_id = ? ORDER BY id LIMIT 1')
        .get(ref.kind, ref.tmdbId)
      if (byTmdb) return Number(byTmdb['id'])
    }
    const key = groupKeyOf(ref)
    const candidates = this.db
      .prepare(
        `SELECT id, group_key, alias_keys, tmdb_id, name, year,
           json_extract(metadata, '$.name') AS meta_name, json_extract(metadata, '$.year') AS meta_year
         FROM title WHERE kind = ? ORDER BY id`
      )
      .all(ref.kind)
    const found = candidates.find((row) => {
      // Titul s jiným TMDB ID je jiný film (stejný název, jiný rok či remake).
      if (ref.tmdbId !== null && row['tmdb_id'] !== null && row['tmdb_id'] !== ref.tmdbId)
        return false
      const keys = [String(row['group_key']), ...parseKeys(row['alias_keys'])]
      if (keys.includes(key)) return true
      const local = refOf({ ...row, kind: ref.kind })
      return groupKeyOf(local) === key
    })
    if (found) return Number(found['id'])
    if (!create) return null
    return Number(
      this.db
        .prepare(
          'INSERT INTO title (kind, group_key, name, alternative_names, year, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(ref.kind, key, ref.name, '[]', ref.year, new Date().toISOString()).lastInsertRowid
    )
  }

  private resolveEpisode(titleId: number, at: { season: number; episode: number }): number {
    const found = this.db
      .prepare('SELECT id FROM episode WHERE title_id = ? AND season = ? AND episode = ?')
      .get(titleId, at.season, at.episode)
    if (found) return Number(found['id'])
    return Number(
      this.db
        .prepare('INSERT INTO episode (title_id, season, episode, name) VALUES (?, ?, ?, NULL)')
        .run(titleId, at.season, at.episode).lastInsertRowid
    )
  }
}

function parseKeys(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? '[]'))
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}
