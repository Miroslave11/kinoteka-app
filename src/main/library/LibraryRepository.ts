import { basename } from 'node:path'
import type { FolderKind, LibraryFolder, MediaFileSummary } from '../../shared/library'
import { transaction, type Database } from '../db/database'
import type { ScanDiff, StoredFile } from './scanner'

type Row = Record<string, unknown>

const toFolder = (row: Row): LibraryFolder => ({
  id: Number(row['id']),
  path: String(row['path']),
  name: String(row['name']),
  kind: row['kind'] as FolderKind,
  online: row['online'] === 1,
  fileCount: Number(row['file_count'] ?? 0),
  lastScanAt: (row['last_scan_at'] as string | null) ?? null,
  lastScanError: (row['last_scan_error'] as string | null) ?? null
})

const toFile = (row: Row): MediaFileSummary => ({
  id: Number(row['id']),
  folderId: Number(row['folder_id']),
  path: String(row['path']),
  relativePath: String(row['relative_path']),
  fileName: basename(String(row['path'])),
  size: Number(row['size']),
  available: row['available'] === 1,
  addedAt: String(row['added_at'])
})

const FOLDER_SELECT = `
  SELECT f.*, (SELECT count(*) FROM media_file m WHERE m.folder_id = f.id AND m.available = 1) AS file_count
  FROM library_folder f`

export class LibraryRepository {
  constructor(private readonly db: Database) {}

  listFolders(): LibraryFolder[] {
    return this.db.prepare(`${FOLDER_SELECT} ORDER BY f.name COLLATE NOCASE`).all().map(toFolder)
  }

  getFolder(id: number): LibraryFolder | undefined {
    const row = this.db.prepare(`${FOLDER_SELECT} WHERE f.id = ?`).get(id)
    return row ? toFolder(row) : undefined
  }

  addFolder(
    folder: { path: string; name: string; kind: FolderKind },
    now = new Date()
  ): LibraryFolder {
    const result = this.db
      .prepare('INSERT INTO library_folder (path, name, kind, created_at) VALUES (?, ?, ?, ?)')
      .run(folder.path, folder.name, folder.kind, now.toISOString())
    return this.getFolder(Number(result.lastInsertRowid))!
  }

  /** Odebere složku z knihovny (soubory na disku zůstanou). */
  removeFolder(id: number): void {
    this.db.prepare('DELETE FROM library_folder WHERE id = ?').run(id)
  }

  listFiles(folderId?: number): MediaFileSummary[] {
    const sql = 'SELECT * FROM media_file'
    const order = ' ORDER BY relative_path COLLATE NOCASE'
    const rows =
      folderId === undefined
        ? this.db.prepare(sql + order).all()
        : this.db.prepare(`${sql} WHERE folder_id = ?${order}`).all(folderId)
    return rows.map(toFile)
  }

  getFile(id: number): MediaFileSummary | undefined {
    const row = this.db.prepare('SELECT * FROM media_file WHERE id = ?').get(id)
    return row ? toFile(row) : undefined
  }

  storedFiles(folderId: number): StoredFile[] {
    return this.db
      .prepare('SELECT id, path, size, mtime_ms FROM media_file WHERE folder_id = ?')
      .all(folderId)
      .map((row) => ({
        id: Number(row['id']),
        path: String(row['path']),
        size: Number(row['size']),
        mtimeMs: Number(row['mtime_ms'])
      }))
  }

  /** Zapíše výsledek skenu najednou – buď celý, nebo vůbec. */
  applyScan(folderId: number, diff: ScanDiff, now = new Date()): void {
    const timestamp = now.toISOString()
    transaction(this.db, () => {
      const insert = this.db.prepare(
        `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, available, added_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      const update = this.db.prepare(
        `UPDATE media_file SET path = ?, relative_path = ?, size = ?, mtime_ms = ?, available = 1, updated_at = ?
         WHERE id = ?`
      )
      const remove = this.db.prepare('DELETE FROM media_file WHERE id = ?')
      // Změněný obsah = znovu zjistit vlastnosti a vyrobit klipy; přesunutý soubor si je ponechá.
      const resetProbe = this.db.prepare(
        'UPDATE media_file SET media_info = NULL, probe_error = NULL, clips_status = NULL WHERE id = ?'
      )
      const resetClips = this.db.prepare('DELETE FROM preview_clip WHERE media_file_id = ?')

      for (const id of diff.removed) remove.run(id)
      for (const { id, file } of [...diff.updated, ...diff.moved]) {
        update.run(file.path, file.relativePath, file.size, file.mtimeMs, timestamp, id)
      }
      for (const { id } of diff.updated) {
        resetProbe.run(id)
        resetClips.run(id)
      }
      for (const file of diff.added) {
        insert.run(
          folderId,
          file.path,
          file.relativePath,
          file.size,
          file.mtimeMs,
          timestamp,
          timestamp
        )
      }
      this.db.prepare('UPDATE media_file SET available = 1 WHERE folder_id = ?').run(folderId)
      this.recordScan(folderId, { online: true, error: null }, now)
    })
  }

  /** Složka je nedostupná: soubory zůstávají v databázi, jen se označí jako nedostupné. */
  markOffline(folderId: number, error: string, now = new Date()): void {
    transaction(this.db, () => {
      this.db.prepare('UPDATE media_file SET available = 0 WHERE folder_id = ?').run(folderId)
      this.recordScan(folderId, { online: false, error }, now)
    })
  }

  private recordScan(
    folderId: number,
    scan: { online: boolean; error: string | null },
    now: Date
  ): void {
    this.db
      .prepare(
        'UPDATE library_folder SET online = ?, last_scan_at = ?, last_scan_error = ? WHERE id = ?'
      )
      .run(scan.online ? 1 : 0, now.toISOString(), scan.error, folderId)
  }
}
