import { basename } from 'node:path'
import type {
  CatalogFile,
  FileDetails,
  MovieItem,
  SeasonItem,
  ShowItem
} from '../../shared/catalog'
import { summarize, type MediaInfo } from '../../shared/mediaInfo'
import type { ImdbRating, MatchStatus, TitleMetadata } from '../../shared/metadata'
import { EMPTY_WATCH_STATE } from '../../shared/playback'
import type { Palette } from '../../shared/posterPalette'
import { transaction, type Database } from '../db/database'
import { JournalRepository } from '../journal/JournalRepository'
import { PlaybackRepository, watchKey } from '../playback/PlaybackRepository'
import { groupMediaFiles } from './grouping'

type Row = Record<string, unknown>

const parseTags = (value: unknown): string[] => {
  try {
    const parsed: unknown = JSON.parse(String(value ?? '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

const parseMediaInfo = (value: unknown): MediaInfo | null => {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as MediaInfo
  } catch {
    return null
  }
}

const toFile = (row: Row): CatalogFile => {
  const info = parseMediaInfo(row['media_info'])
  return {
    id: Number(row['id']),
    fileName: basename(String(row['path'])),
    relativePath: String(row['relative_path']),
    size: Number(row['size']),
    available: row['available'] === 1,
    tags: parseTags(row['tags']),
    addedAt: String(row['added_at']),
    summary: info ? summarize(info) : null
  }
}

const unionTags = (files: CatalogFile[]): string[] => [...new Set(files.flatMap((f) => f.tags))]

const MATCH_STATUSES: MatchStatus[] = [
  'pending',
  'matched',
  'manual',
  'unmatched',
  'error',
  'disabled'
]

function metadataOf(row: Row): {
  metadata: TitleMetadata | null
  matchStatus: MatchStatus
  imdb: ImdbRating | null
  palette: Palette | null
} {
  let palette: Palette | null
  try {
    palette = typeof row['palette'] === 'string' ? (JSON.parse(row['palette']) as Palette) : null
  } catch {
    palette = null
  }
  let metadata: TitleMetadata | null = null
  if (typeof row['metadata'] === 'string') {
    try {
      metadata = JSON.parse(row['metadata']) as TitleMetadata
    } catch {
      metadata = null
    }
  }
  const status = row['match_status'] as MatchStatus
  const imdbId = metadata?.imdbId
  const rating = row['imdb_rating']
  return {
    metadata,
    matchStatus: MATCH_STATUSES.includes(status) ? status : 'pending',
    palette,
    imdb:
      imdbId && typeof rating === 'number'
        ? { id: imdbId, rating, votes: Number(row['imdb_votes'] ?? 0) }
        : null
  }
}

function toMetadataRequest(row: Row): MetadataRequest {
  return {
    id: Number(row['id']),
    kind: row['kind'] === 'show' ? 'show' : 'movie',
    name: String(row['name']),
    year: (row['year'] as number | null) ?? null,
    alternativeNames: parseTags(row['alternative_names']),
    tmdbId: (row['tmdb_id'] as number | null) ?? null,
    status: (row['match_status'] as MatchStatus) ?? 'pending'
  }
}

/** Co potřebuje služba metadat k dohledání titulu. */
export interface MetadataRequest {
  id: number
  kind: 'movie' | 'show'
  name: string
  year: number | null
  alternativeNames: string[]
  /** Už známé TMDB ID – pak se jen znovu načtou údaje, bez nového vyhledávání. */
  tmdbId: number | null
  status: MatchStatus
}

/**
 * Katalog filmů a seriálů. Tituly se odvozují z názvů souborů při každém skenu (rebuild);
 * existující tituly se znovu použijí podle klíče, takže si ponechají id
 * (a v dalších přírůstcích i metadata, hodnocení a historii).
 */
export class CatalogRepository {
  private readonly playback: PlaybackRepository
  private readonly journal: JournalRepository

  constructor(private readonly db: Database) {
    this.playback = new PlaybackRepository(db)
    this.journal = new JournalRepository(db)
  }

  rebuild(now = new Date()): void {
    const files = this.db
      .prepare('SELECT id, relative_path FROM media_file')
      .all()
      .map((row) => ({ id: Number(row['id']), relativePath: String(row['relative_path']) }))
    const grouping = groupMediaFiles(files)
    const timestamp = now.toISOString()

    transaction(this.db, () => {
      const existing = this.db
        .prepare('SELECT id, kind, group_key, alias_keys FROM title')
        .all()
        .map((row) => ({
          id: Number(row['id']),
          kind: String(row['kind']),
          keys: [String(row['group_key']), ...parseTags(row['alias_keys'])]
        }))
      const used = new Set<number>()
      // Shoda podle hlavního klíče nebo aliasu – aliasy vznikají sloučením podle TMDB,
      // takže soubory pod různými názvy téhož filmu skončí u jednoho titulu.
      const findExisting = (kind: string, keys: string[]): number | undefined =>
        (
          existing.find(
            (title) =>
              title.kind === kind && !used.has(title.id) && title.keys.some((k) => keys.includes(k))
          ) ??
          existing.find((title) => title.kind === kind && title.keys.some((k) => keys.includes(k)))
        )?.id

      const insertTitle = this.db.prepare(
        `INSERT INTO title (kind, group_key, name, alternative_names, year, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      )
      const updateTitle = this.db.prepare(
        'UPDATE title SET group_key = ?, name = ?, alternative_names = ?, year = ? WHERE id = ?'
      )
      const upsertTitle = (
        kind: string,
        keys: string[],
        key: string,
        name: string,
        alternatives: string[],
        year: number | null
      ): number => {
        const id = findExisting(kind, keys)
        const alternativeJson = JSON.stringify(alternatives)
        if (id !== undefined) {
          // Druhá skupina souborů téhož titulu (alias) se jen připojí, název určuje první.
          if (!used.has(id)) updateTitle.run(key, name, alternativeJson, year, id)
          used.add(id)
          return id
        }
        const created = Number(
          insertTitle.run(kind, key, name, alternativeJson, year, timestamp).lastInsertRowid
        )
        used.add(created)
        return created
      }

      const linkFile = this.db.prepare(
        'UPDATE media_file SET title_id = ?, episode_id = ?, tags = ? WHERE id = ?'
      )
      const tagsOf = (fileId: number): string =>
        JSON.stringify(grouping.parsed.get(fileId)?.tags ?? [])
      const selectEpisode = this.db.prepare(
        'SELECT id FROM episode WHERE title_id = ? AND season = ? AND episode = ?'
      )
      const insertEpisode = this.db.prepare(
        'INSERT INTO episode (title_id, season, episode, name) VALUES (?, ?, ?, ?)'
      )
      const updateEpisode = this.db.prepare('UPDATE episode SET name = ? WHERE id = ?')

      this.db.exec('UPDATE media_file SET title_id = NULL, episode_id = NULL')

      for (const movie of grouping.movies) {
        const id = upsertTitle('movie', [movie.key], movie.key, movie.name, [], movie.year)
        for (const fileId of movie.fileIds) linkFile.run(id, null, tagsOf(fileId), fileId)
      }

      for (const show of grouping.shows) {
        const id = upsertTitle(
          'show',
          show.keys,
          show.key,
          show.name,
          show.alternativeNames,
          show.year
        )
        for (const episode of show.episodes) {
          const found = selectEpisode.get(id, episode.season, episode.episode)
          let episodeId: number
          if (found) {
            episodeId = Number(found['id'])
            updateEpisode.run(episode.name, episodeId)
          } else {
            episodeId = Number(
              insertEpisode.run(id, episode.season, episode.episode, episode.name).lastInsertRowid
            )
          }
          for (const fileId of episode.fileIds) linkFile.run(id, episodeId, tagsOf(fileId), fileId)
        }
      }

      // Tituly a díly bez souborů se mažou, kromě zhlédnutých a ohodnocených – deník o ně nesmí přijít.
      // Když se soubor vrátí, připojí se k nim zase podle klíče názvu.
      this.db.exec(
        `DELETE FROM episode
         WHERE id NOT IN (SELECT episode_id FROM media_file WHERE episode_id IS NOT NULL)
           AND id NOT IN (SELECT episode_id FROM watch_event WHERE episode_id IS NOT NULL)`
      )
      this.db.exec(
        `DELETE FROM title
         WHERE id NOT IN (SELECT title_id FROM media_file WHERE title_id IS NOT NULL)
           AND id NOT IN (SELECT title_id FROM watch_event)
           AND id NOT IN (SELECT title_id FROM title_rating)`
      )
    })
  }

  // Knihovna ukazuje jen tituly a díly se soubory; ty bez souborů drží jen deník.
  listMovies(): MovieItem[] {
    const titles = this.db
      .prepare(
        `SELECT * FROM title WHERE kind = 'movie'
           AND id IN (SELECT title_id FROM media_file WHERE title_id IS NOT NULL)
         ORDER BY name COLLATE NOCASE`
      )
      .all()
    const files = this.filesByTitle()
    const clips = this.clipsByTitle()
    const watch = this.playback.watchStates()
    const ratings = this.journal.ratings()
    return titles.map((row) => {
      const id = Number(row['id'])
      const movieFiles = files.get(id) ?? []
      return {
        id,
        name: String(row['name']),
        year: (row['year'] as number | null) ?? null,
        tags: unionTags(movieFiles),
        files: movieFiles,
        clips: clips.get(id) ?? [],
        myRating: ratings.get(id) ?? null,
        watch: watch.get(watchKey(id, null)) ?? EMPTY_WATCH_STATE,
        ...metadataOf(row)
      }
    })
  }

  listShows(): ShowItem[] {
    const titles = this.db
      .prepare(
        `SELECT * FROM title WHERE kind = 'show'
           AND id IN (SELECT title_id FROM media_file WHERE title_id IS NOT NULL)
         ORDER BY name COLLATE NOCASE`
      )
      .all()
    const clips = this.clipsByTitle()
    const watch = this.playback.watchStates()
    const ratings = this.journal.ratings()
    const episodes = this.db
      .prepare(
        `SELECT * FROM episode
         WHERE id IN (SELECT episode_id FROM media_file WHERE episode_id IS NOT NULL)
         ORDER BY season, episode`
      )
      .all()
    const filesByEpisode = new Map<number, CatalogFile[]>()
    for (const row of this.db
      .prepare('SELECT * FROM media_file WHERE episode_id IS NOT NULL ORDER BY path')
      .all()) {
      const episodeId = Number(row['episode_id'])
      filesByEpisode.set(episodeId, [...(filesByEpisode.get(episodeId) ?? []), toFile(row)])
    }

    return titles.map((row) => {
      const id = Number(row['id'])
      const seasons = new Map<number, SeasonItem>()
      for (const episode of episodes.filter((e) => Number(e['title_id']) === id)) {
        const number = Number(episode['season'])
        const season = seasons.get(number) ?? { number, episodes: [] }
        season.episodes.push({
          id: Number(episode['id']),
          season: number,
          episode: Number(episode['episode']),
          name: (episode['name'] as string | null) ?? null,
          files: filesByEpisode.get(Number(episode['id'])) ?? [],
          watch: watch.get(watchKey(id, Number(episode['id']))) ?? EMPTY_WATCH_STATE
        })
        seasons.set(number, season)
      }
      const allSeasons = [...seasons.values()]
      return {
        id,
        name: String(row['name']),
        year: (row['year'] as number | null) ?? null,
        alternativeNames: parseTags(row['alternative_names']),
        tags: unionTags(allSeasons.flatMap((s) => s.episodes.flatMap((e) => e.files))),
        seasons: allSeasons,
        episodeCount: allSeasons.reduce((total, season) => total + season.episodes.length, 0),
        clips: clips.get(id) ?? [],
        myRating: ratings.get(id) ?? null,
        ...metadataOf(row)
      }
    })
  }

  // ---------- metadata ----------

  /**
   * Tituly, které čekají na dohledání, chybné (po hodině znovu) a spárované s vynuceným
   * obnovením údajů (metadata_updated_at = NULL).
   */
  titlesNeedingMetadata(now = new Date()): MetadataRequest[] {
    const retryBefore = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    return this.db
      .prepare(
        `SELECT * FROM title
         WHERE match_status = 'pending'
            OR (match_status = 'error' AND (metadata_updated_at IS NULL OR metadata_updated_at < ?))
            OR (match_status IN ('matched', 'manual') AND tmdb_id IS NOT NULL
                AND metadata_updated_at IS NULL)
         ORDER BY id`
      )
      .all(retryBefore)
      .map(toMetadataRequest)
  }

  titleForMetadata(id: number): MetadataRequest | undefined {
    const row = this.db.prepare('SELECT * FROM title WHERE id = ?').get(id)
    return row ? toMetadataRequest(row) : undefined
  }

  /** „Znovu načíst údaje“: u spárovaného titulu jen obnoví údaje z TMDB, jinak hledá znovu. */
  expireMetadata(id: number): void {
    this.db
      .prepare(
        `UPDATE title SET metadata_updated_at = NULL,
         match_status = CASE WHEN tmdb_id IS NULL THEN 'pending' ELSE match_status END
         WHERE id = ?`
      )
      .run(id)
  }

  // ---------- hodnocení IMDb ----------

  /** Tituly s IMDb ID (z údajů TMDB). */
  imdbIds(): { id: number; imdbId: string }[] {
    return this.db
      .prepare(
        `SELECT id, json_extract(metadata, '$.imdbId') AS imdb_id FROM title
         WHERE json_extract(metadata, '$.imdbId') IS NOT NULL`
      )
      .all()
      .map((row) => ({ id: Number(row['id']), imdbId: String(row['imdb_id']) }))
  }

  /** Kolik titulů má IMDb ID a kolik z nich hodnocení. */
  imdbCounts(): { titles: number; rated: number } {
    const row = this.db
      .prepare(
        `SELECT count(*) AS titles, count(imdb_rating) AS rated FROM title
         WHERE json_extract(metadata, '$.imdbId') IS NOT NULL`
      )
      .get()
    return { titles: Number(row?.['titles'] ?? 0), rated: Number(row?.['rated'] ?? 0) }
  }

  /** Tituly s IMDb ID, které ještě hodnocení nemají. */
  countMissingImdbRatings(): number {
    const row = this.db
      .prepare(
        `SELECT count(*) AS n FROM title
         WHERE json_extract(metadata, '$.imdbId') IS NOT NULL AND imdb_updated_at IS NULL`
      )
      .get()
    return Number(row?.['n'] ?? 0)
  }

  /** Zapíše hodnocení; titul, který v datech IMDb není, dostane NULL (třeba zatím nevyšel). */
  /**
   * @param targets tituly, jejichž hodnocení se v souboru hledala – titul, který IMDb ID dostal
   *   až během čtení souboru, se nesmí označit jako hotový.
   */
  saveImdbRatings(
    ratings: Map<string, { rating: number; votes: number }>,
    targets: { id: number; imdbId: string }[],
    now = new Date()
  ): number {
    // Titul mohl mezitím dostat jiné IMDb ID (nová shoda) – pak se jeho záznam nemění.
    const update = this.db.prepare(
      `UPDATE title SET imdb_rating = ?, imdb_votes = ?, imdb_updated_at = ?
       WHERE id = ? AND json_extract(metadata, '$.imdbId') = ?`
    )
    let found = 0
    transaction(this.db, () => {
      for (const { id, imdbId } of targets) {
        const rating = ratings.get(imdbId)
        if (rating) found++
        update.run(rating?.rating ?? null, rating?.votes ?? null, now.toISOString(), id, imdbId)
      }
    })
    return found
  }

  saveMetadata(
    id: number,
    metadata: TitleMetadata,
    status: 'matched' | 'manual',
    now = new Date()
  ): void {
    // Jiný titul na TMDB = jiné hodnocení z IMDb, staré se zahodí.
    this.db
      .prepare(
        'UPDATE title SET imdb_rating = NULL, imdb_votes = NULL, imdb_updated_at = NULL WHERE id = ? AND tmdb_id IS NOT ?'
      )
      .run(id, metadata.tmdbId)
    this.db
      .prepare(
        `UPDATE title SET tmdb_id = ?, metadata = ?, match_status = ?, metadata_error = NULL,
         metadata_updated_at = ? WHERE id = ?`
      )
      .run(metadata.tmdbId, JSON.stringify(metadata), status, now.toISOString(), id)
  }

  setMatchStatus(
    id: number,
    status: MatchStatus,
    error: string | null = null,
    now = new Date()
  ): void {
    this.db
      .prepare(
        'UPDATE title SET match_status = ?, metadata_error = ?, metadata_updated_at = ? WHERE id = ?'
      )
      .run(status, error, now.toISOString(), id)
  }

  /** Po zadání nového klíče TMDB zkusí znovu vše, co se nepovedlo. */
  resetUnmatched(): void {
    this.db.exec(
      "UPDATE title SET match_status = 'pending' WHERE match_status IN ('unmatched', 'error', 'disabled')"
    )
  }

  /**
   * Tituly, které TMDB pozná jako tentýž film/seriál, sloučí do jednoho (např. soubory
   * pojmenované česky a anglicky). Vrací true, když se něco sloučilo – pak je potřeba rebuild.
   */
  mergeByTmdb(): boolean {
    const duplicates = this.db
      .prepare(
        `SELECT kind, tmdb_id FROM title WHERE tmdb_id IS NOT NULL
         GROUP BY kind, tmdb_id HAVING count(*) > 1`
      )
      .all()
    if (duplicates.length === 0) return false
    transaction(this.db, () => {
      for (const duplicate of duplicates) {
        const titles = this.db
          .prepare(
            'SELECT id, group_key, alias_keys, match_status FROM title WHERE kind = ? AND tmdb_id = ? ORDER BY id'
          )
          .all(duplicate['kind'], duplicate['tmdb_id'])
        // Ruční shoda má přednost, jinak nejstarší titul.
        const target = titles.find((t) => t['match_status'] === 'manual') ?? titles[0]!
        const keys = new Set(parseTags(target['alias_keys']))
        for (const other of titles.filter((t) => t !== target)) {
          keys.add(String(other['group_key']))
          for (const key of parseTags(other['alias_keys'])) keys.add(key)
          this.db.prepare('DELETE FROM title WHERE id = ?').run(other['id'])
        }
        keys.delete(String(target['group_key']))
        this.db
          .prepare('UPDATE title SET alias_keys = ? WHERE id = ?')
          .run(JSON.stringify([...keys]), target['id'])
      }
    })
    return true
  }

  fileDetails(fileId: number): FileDetails | null {
    const row = this.db
      .prepare(
        `SELECT m.*, f.name AS folder_name, f.kind AS folder_kind
         FROM media_file m JOIN library_folder f ON f.id = m.folder_id WHERE m.id = ?`
      )
      .get(fileId)
    if (!row) return null
    const info = parseMediaInfo(row['media_info'])
    const error = (row['probe_error'] as string | null) ?? null
    return {
      file: toFile(row),
      path: String(row['path']),
      folderName: String(row['folder_name']),
      folderKind: row['folder_kind'] === 'network' ? 'network' : 'local',
      info,
      error,
      pending: !info && !error
    }
  }

  // ---------- barvy a klipy na pozadí ----------

  /** Tituly s plakátem, u kterých paleta chybí nebo je z jiného plakátu. */
  titlesNeedingPalette(): { id: number; posterUrl: string }[] {
    return this.db
      .prepare(
        `SELECT id, json_extract(metadata, '$.posterUrl') AS poster FROM title
         WHERE json_extract(metadata, '$.posterUrl') IS NOT NULL
           AND palette_source IS NOT json_extract(metadata, '$.posterUrl')`
      )
      .all()
      .map((row) => ({ id: Number(row['id']), posterUrl: String(row['poster']) }))
  }

  savePalette(id: number, posterUrl: string, palette: Palette | null): void {
    this.db
      .prepare('UPDATE title SET palette = ?, palette_source = ? WHERE id = ?')
      .run(palette ? JSON.stringify(palette) : null, posterUrl, id)
  }

  /**
   * Soubory, ze kterých se mají vyrobit klipy: u filmu první dostupný soubor, u seriálu
   * první dostupný díl. Jen analyzované soubory (je potřeba znát délku).
   */
  filesNeedingClips(): { id: number; path: string; durationSec: number; hdr: boolean }[] {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.path, m.title_id, m.clips_status,
                json_extract(m.media_info, '$.durationSec') AS duration,
                json_extract(m.media_info, '$.video.hdr') AS hdr
         FROM media_file m LEFT JOIN episode e ON e.id = m.episode_id
         WHERE m.title_id IS NOT NULL AND m.available = 1 AND m.media_info IS NOT NULL
         ORDER BY m.title_id, e.season, e.episode, m.path`
      )
      .all()
    const seen = new Set<number>()
    const result: { id: number; path: string; durationSec: number; hdr: boolean }[] = []
    for (const row of rows) {
      const titleId = Number(row['title_id'])
      if (seen.has(titleId)) continue
      seen.add(titleId)
      if (row['clips_status'] !== null) continue
      result.push({
        id: Number(row['id']),
        path: String(row['path']),
        durationSec: Number(row['duration'] ?? 0),
        hdr: row['hdr'] !== null && row['hdr'] !== undefined
      })
    }
    return result
  }

  saveClips(fileId: number, files: string[], status: 'done' | 'error' | 'skipped'): void {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM preview_clip WHERE media_file_id = ?').run(fileId)
      const insert = this.db.prepare(
        'INSERT INTO preview_clip (media_file_id, idx, file) VALUES (?, ?, ?)'
      )
      files.forEach((file, idx) => insert.run(fileId, idx, file))
      this.db.prepare('UPDATE media_file SET clips_status = ? WHERE id = ?').run(status, fileId)
    })
  }

  /** Všechny soubory klipů, na které databáze odkazuje (úklid nepotřebných souborů). */
  clipFiles(): Set<string> {
    return new Set(
      this.db
        .prepare('SELECT file FROM preview_clip')
        .all()
        .map((row) => String(row['file']))
    )
  }

  /** Smaže všechny klipy (vypnutí klipů v Nastavení). */
  clearClips(): void {
    this.db.exec('DELETE FROM preview_clip; UPDATE media_file SET clips_status = NULL')
  }

  private clipsByTitle(): Map<number, string[]> {
    const map = new Map<number, string[]>()
    const rows = this.db
      .prepare(
        `SELECT m.title_id, c.file FROM preview_clip c JOIN media_file m ON m.id = c.media_file_id
         WHERE m.available = 1 ORDER BY m.title_id, c.media_file_id, c.idx`
      )
      .all()
    for (const row of rows) {
      const titleId = Number(row['title_id'])
      map.set(titleId, [
        ...(map.get(titleId) ?? []),
        `kinoteka-media://clips/${String(row['file'])}`
      ])
    }
    return map
  }

  private filesByTitle(): Map<number, CatalogFile[]> {
    const map = new Map<number, CatalogFile[]>()
    for (const row of this.db
      .prepare('SELECT * FROM media_file WHERE title_id IS NOT NULL ORDER BY path')
      .all()) {
      const titleId = Number(row['title_id'])
      map.set(titleId, [...(map.get(titleId) ?? []), toFile(row)])
    }
    return map
  }
}
