/**
 * Migrace databáze. Každá se spustí jednou, číslo poslední je uložené v PRAGMA user_version.
 * Existující migrace se nikdy nemění – změna schématu = nová migrace na konci.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 – složky knihovny a nalezené soubory
  `
  CREATE TABLE library_folder (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('local', 'network')),
    online INTEGER NOT NULL DEFAULT 1,
    last_scan_at TEXT,
    last_scan_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE media_file (
    id INTEGER PRIMARY KEY,
    folder_id INTEGER NOT NULL REFERENCES library_folder (id) ON DELETE CASCADE,
    path TEXT NOT NULL UNIQUE COLLATE NOCASE,
    relative_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime_ms INTEGER NOT NULL,
    available INTEGER NOT NULL DEFAULT 1,
    added_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX media_file_folder ON media_file (folder_id);
  `
]
