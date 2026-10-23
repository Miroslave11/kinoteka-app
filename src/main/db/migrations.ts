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
  `,

  // 2 – tituly (filmy a seriály) a díly, rozpoznané z názvů souborů
  `
  CREATE TABLE title (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('movie', 'show')),
    -- normalizovaný název (+ rok u filmů), podle kterého se soubory automaticky seskupují
    group_key TEXT NOT NULL,
    name TEXT NOT NULL,
    alternative_names TEXT NOT NULL DEFAULT '[]',
    year INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE INDEX title_group ON title (kind, group_key);

  CREATE TABLE episode (
    id INTEGER PRIMARY KEY,
    title_id INTEGER NOT NULL REFERENCES title (id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    episode INTEGER NOT NULL,
    name TEXT,
    UNIQUE (title_id, season, episode)
  );

  ALTER TABLE media_file ADD COLUMN title_id INTEGER REFERENCES title (id) ON DELETE SET NULL;
  ALTER TABLE media_file ADD COLUMN episode_id INTEGER REFERENCES episode (id) ON DELETE SET NULL;
  ALTER TABLE media_file ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

  CREATE INDEX media_file_title ON media_file (title_id);
  `,

  // 3 – technické vlastnosti souboru z ffprobe (JSON MediaInfo)
  `
  ALTER TABLE media_file ADD COLUMN media_info TEXT;
  ALTER TABLE media_file ADD COLUMN probe_error TEXT;
  `,

  // 4 – metadata z TMDB a nastavení aplikace
  `
  ALTER TABLE title ADD COLUMN tmdb_id INTEGER;
  ALTER TABLE title ADD COLUMN match_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE title ADD COLUMN metadata TEXT;
  ALTER TABLE title ADD COLUMN metadata_error TEXT;
  ALTER TABLE title ADD COLUMN metadata_updated_at TEXT;
  -- další klíče názvů, pod kterými se k titulu mají přiřadit soubory (sloučení podle TMDB)
  ALTER TABLE title ADD COLUMN alias_keys TEXT NOT NULL DEFAULT '[]';

  CREATE INDEX title_tmdb ON title (kind, tmdb_id);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  // 5 – údaje z ČSFD (ID přes Wikidata, stránka filmu)
  `
  ALTER TABLE title ADD COLUMN csfd_id INTEGER;
  ALTER TABLE title ADD COLUMN csfd TEXT;
  ALTER TABLE title ADD COLUMN csfd_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE title ADD COLUMN csfd_error TEXT;
  ALTER TABLE title ADD COLUMN csfd_updated_at TEXT;
  `
]
