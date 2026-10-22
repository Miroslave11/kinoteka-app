import { basename } from 'node:path'
import type { CatalogFile, MovieItem, SeasonItem, ShowItem } from '../../shared/catalog'
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

const toFile = (row: Row): CatalogFile => ({
  id: Number(row['id']),
  fileName: basename(String(row['path'])),
  relativePath: String(row['relative_path']),
  size: Number(row['size']),
  available: row['available'] === 1,
  tags: parseTags(row['tags'])
})

const unionTags = (files: CatalogFile[]): string[] => [...new Set(files.flatMap((f) => f.tags))]

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
        .prepare('SELECT id, kind, group_key FROM title')
        .all()
        .map((row) => ({
          id: Number(row['id']),
          kind: String(row['kind']),
          key: String(row['group_key'])
        }))
      const used = new Set<number>()
      const findExisting = (kind: string, keys: string[]): number | undefined =>
        existing.find(
          (title) => title.kind === kind && !used.has(title.id) && keys.includes(title.key)
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
          updateTitle.run(key, name, alternativeJson, year, id)
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
        files: movieFiles
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
        episodeCount: allSeasons.reduce((total, season) => total + season.episodes.length, 0)
      }
    })
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
