import type { JournalEntry, ManualEntry } from '../../shared/journal'
import type { TitleMetadata } from '../../shared/metadata'
import { transaction, type Database } from '../db/database'

type Row = Record<string, unknown>

function parseMetadata(value: unknown): TitleMetadata | null {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as TitleMetadata
  } catch {
    return null
  }
}

function toEntry(row: Row): JournalEntry {
  const metadata = parseMetadata(row['metadata'])
  const season = row['season'] === null ? null : Number(row['season'])
  const number = row['episode'] === null ? null : Number(row['episode'])
  const known =
    season !== null && number !== null
      ? metadata?.seasons
          .find((s) => s.number === season)
          ?.episodes.find((e) => e.number === number)
      : undefined
  // Délka: ze souboru, jinak z TMDB (u dílu jeho délka nebo typická délka dílu seriálu).
  let runtimeMin: number | null = null
  if (typeof row['duration'] === 'number') runtimeMin = Math.round(row['duration'] / 60)
  else if (row['episode_id'] !== null)
    runtimeMin = known?.runtimeMin ?? metadata?.runtimeMin ?? null
  else if (row['kind'] === 'movie') runtimeMin = metadata?.runtimeMin ?? null

  return {
    id: Number(row['id']),
    titleId: Number(row['title_id']),
    kind: row['kind'] === 'show' ? 'show' : 'movie',
    titleName: metadata?.name || String(row['name']),
    year: metadata?.year ?? (row['year'] as number | null) ?? null,
    posterUrl: metadata?.posterUrl ?? null,
    episode:
      season !== null && number !== null
        ? {
            id: Number(row['episode_id']),
            season,
            episode: number,
            name: known?.name ?? (row['episode_name'] as string | null) ?? null
          }
        : null,
    watchedAt: String(row['watched_at']),
    source: row['source'] === 'manual' ? 'manual' : 'auto',
    note: (row['note'] as string | null) ?? null,
    rating: typeof row['rating'] === 'number' ? row['rating'] : null,
    ordinal: Number(row['ordinal']),
    runtimeMin,
    inLibrary: row['in_library'] === 1
  }
}

/** Deník zhlédnutí a moje hodnocení titulů. Záznamy zůstávají i po smazání souboru. */
export class JournalRepository {
  constructor(private readonly db: Database) {}

  list(): JournalEntry[] {
    return this.db
      .prepare(
        `SELECT w.id, w.title_id, w.episode_id, w.watched_at, w.source, w.note,
                t.kind, t.name, t.year, t.metadata, r.rating,
                e.season, e.episode, e.name AS episode_name,
                (SELECT COUNT(*) FROM watch_event w2
                  WHERE w2.title_id = w.title_id AND w2.episode_id IS w.episode_id
                    AND (w2.watched_at < w.watched_at OR (w2.watched_at = w.watched_at AND w2.id <= w.id))
                ) AS ordinal,
                EXISTS (SELECT 1 FROM media_file f WHERE f.title_id = w.title_id) AS in_library,
                (SELECT json_extract(f.media_info, '$.durationSec') FROM media_file f
                  WHERE f.title_id = w.title_id AND f.episode_id IS w.episode_id
                    AND f.media_info IS NOT NULL LIMIT 1) AS duration
         FROM watch_event w
         JOIN title t ON t.id = w.title_id
         LEFT JOIN episode e ON e.id = w.episode_id
         LEFT JOIN title_rating r ON r.title_id = w.title_id
         ORDER BY w.watched_at DESC, w.id DESC`
      )
      .all()
      .map(toEntry)
  }

  /** „Viděl jsem“ – film, celý seriál, nebo vybrané díly. Vrací počet nových záznamů. */
  addManual(entry: ManualEntry): number {
    const title = this.db.prepare('SELECT kind FROM title WHERE id = ?').get(entry.titleId)
    if (!title) return 0
    const episodes =
      entry.episodeIds.length === 0
        ? [null]
        : entry.episodeIds.filter(
            (id) =>
              this.db
                .prepare('SELECT 1 FROM episode WHERE id = ? AND title_id = ?')
                .get(id, entry.titleId) !== undefined
          )
    const insert = this.db.prepare(
      "INSERT INTO watch_event (title_id, episode_id, watched_at, source, note) VALUES (?, ?, ?, 'manual', ?)"
    )
    transaction(this.db, () => {
      for (const episodeId of episodes) {
        insert.run(entry.titleId, episodeId, entry.watchedAt, entry.note)
        // Zhlédnutý film nebo díl už není rozkoukaný.
        this.db
          .prepare('DELETE FROM playback_progress WHERE title_id = ? AND episode_id IS ?')
          .run(entry.titleId, episodeId)
      }
    })
    return episodes.length
  }

  update(id: number, patch: { watchedAt?: string; note?: string | null }): void {
    if (patch.watchedAt !== undefined) {
      this.db.prepare('UPDATE watch_event SET watched_at = ? WHERE id = ?').run(patch.watchedAt, id)
    }
    if (patch.note !== undefined) {
      this.db.prepare('UPDATE watch_event SET note = ? WHERE id = ?').run(patch.note, id)
    }
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM watch_event WHERE id = ?').run(id)
  }

  /** Moje hodnocení titulu; null hodnocení smaže. */
  setRating(titleId: number, rating: number | null, now = new Date()): void {
    if (rating === null) {
      this.db.prepare('DELETE FROM title_rating WHERE title_id = ?').run(titleId)
      return
    }
    this.db
      .prepare(
        `INSERT INTO title_rating (title_id, rating, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (title_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`
      )
      .run(titleId, rating, now.toISOString())
  }

  /** Moje hodnocení všech titulů (pro katalog). */
  ratings(): Map<number, number> {
    return new Map(
      this.db
        .prepare('SELECT title_id, rating FROM title_rating')
        .all()
        .map((row) => [Number(row['title_id']), Number(row['rating'])])
    )
  }
}
