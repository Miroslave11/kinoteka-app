import { basename } from 'node:path'
import type {
  CatalogFile,
  FileDetails,
  MovieItem,
  SeasonItem,
  ShowItem
} from '../../shared/catalog'
import { summarize, type MediaInfo } from '../../shared/mediaInfo'
import type { CsfdData, CsfdStatus } from '../../shared/csfd'
import type { MatchStatus, TitleMetadata } from '../../shared/metadata'
import { transaction, type Database } from '../db/database'
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

const CSFD_STATUSES: CsfdStatus[] = ['pending', 'linked', 'manual', 'notfound', 'error']

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function metadataOf(row: Row): {
  metadata: TitleMetadata | null
  matchStatus: MatchStatus
  csfd: CsfdData | null
  csfdStatus: CsfdStatus
} {
  let metadata: TitleMetadata | null = null
  if (typeof row['metadata'] === 'string') {
    try {
      metadata = JSON.parse(row['metadata']) as TitleMetadata
    } catch {
      metadata = null
    }
  }
  const status = row['match_status'] as MatchStatus
  const csfdStatus = row['csfd_status'] as CsfdStatus
  return {
    metadata,
    matchStatus: MATCH_STATUSES.includes(status) ? status : 'pending',
    csfd: parseJson<CsfdData>(row['csfd']),
    csfdStatus: CSFD_STATUSES.includes(csfdStatus) ? csfdStatus : 'pending'
  }
}

/** Co potřebuje služba metadat k dohledání titulu. */
export interface MetadataRequest {
  id: number
  kind: 'movie' | 'show'
  name: string
  year: number | null
  alternativeNames: string[]
}

/**
 * Katalog filmů a seriálů. Tituly se odvozují z názvů souborů při každém skenu (rebuild);
 * existující tituly se znovu použijí podle klíče, takže si ponechají id
 * (a v dalších přírůstcích i metadata, hodnocení a historii).
 */
export class CatalogRepository {
  constructor(private readonly db: Database) {}

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

      // Tituly a díly bez souborů zatím mažeme. Až budou mít hodnocení a historii
      // (přírůstek 12), musí zůstat – tahle podmínka se pak rozšíří.
      this.db.exec(
        'DELETE FROM episode WHERE id NOT IN (SELECT episode_id FROM media_file WHERE episode_id IS NOT NULL)'
      )
      this.db.exec(
        'DELETE FROM title WHERE id NOT IN (SELECT title_id FROM media_file WHERE title_id IS NOT NULL)'
      )
    })
  }

  listMovies(): MovieItem[] {
    const titles = this.db
      .prepare("SELECT * FROM title WHERE kind = 'movie' ORDER BY name COLLATE NOCASE")
      .all()
    const files = this.filesByTitle()
    return titles.map((row) => {
      const movieFiles = files.get(Number(row['id'])) ?? []
      return {
        id: Number(row['id']),
        name: String(row['name']),
        year: (row['year'] as number | null) ?? null,
        tags: unionTags(movieFiles),
        files: movieFiles,
        ...metadataOf(row)
      }
    })
  }

  listShows(): ShowItem[] {
    const titles = this.db
      .prepare("SELECT * FROM title WHERE kind = 'show' ORDER BY name COLLATE NOCASE")
      .all()
    const episodes = this.db.prepare('SELECT * FROM episode ORDER BY season, episode').all()
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
          files: filesByEpisode.get(Number(episode['id'])) ?? []
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
        ...metadataOf(row)
      }
    })
  }

  // ---------- metadata ----------

  /** Tituly, které čekají na dohledání (a chybné, u kterých už uplynula hodina). */
  titlesNeedingMetadata(now = new Date()): MetadataRequest[] {
    const retryBefore = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    return this.db
      .prepare(
        `SELECT id, kind, name, year, alternative_names FROM title
         WHERE match_status = 'pending'
            OR (match_status = 'error' AND (metadata_updated_at IS NULL OR metadata_updated_at < ?))
         ORDER BY id`
      )
      .all(retryBefore)
      .map((row) => ({
        id: Number(row['id']),
        kind: row['kind'] === 'show' ? 'show' : 'movie',
        name: String(row['name']),
        year: (row['year'] as number | null) ?? null,
        alternativeNames: parseTags(row['alternative_names'])
      }))
  }

  titleForMetadata(id: number): MetadataRequest | undefined {
    const row = this.db
      .prepare('SELECT id, kind, name, year, alternative_names FROM title WHERE id = ?')
      .get(id)
    if (!row) return undefined
    return {
      id,
      kind: row['kind'] === 'show' ? 'show' : 'movie',
      name: String(row['name']),
      year: (row['year'] as number | null) ?? null,
      alternativeNames: parseTags(row['alternative_names'])
    }
  }

  saveMetadata(
    id: number,
    metadata: TitleMetadata,
    status: 'matched' | 'manual',
    now = new Date()
  ): void {
    // Jiný titul na TMDB = jiný film i na ČSFD; ručně propojené ČSFD se nemění.
    this.db
      .prepare(
        `UPDATE title SET csfd_id = NULL, csfd = NULL, csfd_status = 'pending', csfd_error = NULL
         WHERE id = ? AND tmdb_id IS NOT ? AND csfd_status != 'manual'`
      )
      .run(id, metadata.tmdbId)
    this.db
      .prepare(
        `UPDATE title SET tmdb_id = ?, metadata = ?, match_status = ?, metadata_error = NULL,
         metadata_updated_at = ? WHERE id = ?`
      )
      .run(metadata.tmdbId, JSON.stringify(metadata), status, now.toISOString(), id)
  }

  // ---------- ČSFD ----------

  /** Tituly s TMDB ID, u kterých se ještě nehledalo ID z ČSFD. */
  csfdLookups(): { id: number; kind: 'movie' | 'show'; tmdbId: number }[] {
    return this.db
      .prepare(
        "SELECT id, kind, tmdb_id FROM title WHERE csfd_status = 'pending' AND tmdb_id IS NOT NULL ORDER BY id"
      )
      .all()
      .map((row) => ({
        id: Number(row['id']),
        kind: row['kind'] === 'show' ? 'show' : 'movie',
        tmdbId: Number(row['tmdb_id'])
      }))
  }

  /**
   * Tituly, u kterých je potřeba načíst stránku ČSFD: ještě nenačtené, starší než 30 dní,
   * nebo s chybou starší než 6 hodin.
   */
  csfdFetches(now = new Date()): { id: number; csfdId: number }[] {
    const day = 24 * 60 * 60 * 1000
    const stale = new Date(now.getTime() - 30 * day).toISOString()
    const retry = new Date(now.getTime() - day / 4).toISOString()
    return this.db
      .prepare(
        `SELECT id, csfd_id FROM title WHERE csfd_id IS NOT NULL AND (
           (csfd_status IN ('linked', 'manual') AND (csfd IS NULL OR csfd_updated_at < ?))
           OR (csfd_status = 'error' AND (csfd_updated_at IS NULL OR csfd_updated_at < ?))
         ) ORDER BY csfd IS NOT NULL, id`
      )
      .all(stale, retry)
      .map((row) => ({ id: Number(row['id']), csfdId: Number(row['csfd_id']) }))
  }

  setCsfdLink(id: number, csfdId: number | null, status: CsfdStatus): void {
    this.db
      .prepare(
        `UPDATE title SET csfd_id = ?, csfd_status = ?, csfd_error = NULL,
         csfd = CASE WHEN csfd_id IS ? THEN csfd ELSE NULL END WHERE id = ?`
      )
      .run(csfdId, status, csfdId, id)
  }

  saveCsfd(id: number, data: CsfdData, now = new Date()): void {
    this.db
      .prepare(
        `UPDATE title SET csfd = ?, csfd_error = NULL, csfd_updated_at = ?,
         csfd_status = CASE WHEN csfd_status = 'manual' THEN 'manual' ELSE 'linked' END WHERE id = ?`
      )
      .run(JSON.stringify(data), now.toISOString(), id)
  }

  setCsfdError(id: number, error: string, now = new Date()): void {
    this.db
      .prepare(
        "UPDATE title SET csfd_status = 'error', csfd_error = ?, csfd_updated_at = ? WHERE id = ?"
      )
      .run(error, now.toISOString(), id)
  }

  /** Vynutí nové načtení stránky ČSFD (tlačítko „Znovu načíst údaje“). */
  expireCsfd(id: number): void {
    this.db
      .prepare('UPDATE title SET csfd_updated_at = NULL WHERE id = ? AND csfd_id IS NOT NULL')
      .run(id)
    this.db
      .prepare("UPDATE title SET csfd_status = 'linked' WHERE id = ? AND csfd_status = 'error'")
      .run(id)
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
