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
  `,

  // 6 – ČSFD nahrazeno hodnocením z IMDb (ČSFD aplikaci nevydávalo stránky filmů)
  `
  ALTER TABLE title DROP COLUMN csfd_id;
  ALTER TABLE title DROP COLUMN csfd;
  ALTER TABLE title DROP COLUMN csfd_status;
  ALTER TABLE title DROP COLUMN csfd_error;
  ALTER TABLE title DROP COLUMN csfd_updated_at;
  DELETE FROM settings WHERE key LIKE 'csfd.%';

  ALTER TABLE title ADD COLUMN imdb_rating REAL;
  ALTER TABLE title ADD COLUMN imdb_votes INTEGER;
  ALTER TABLE title ADD COLUMN imdb_updated_at TEXT;

  -- Starší údaje z TMDB nemají IMDb ID: obnovit je podle už známého TMDB ID (bez nového hledání).
  UPDATE title SET metadata_updated_at = NULL
  WHERE tmdb_id IS NOT NULL AND json_extract(metadata, '$.imdbId') IS NULL;
  `,

  // 7 – barvy z plakátu a klipy na pozadí
  `
  -- paleta (JSON) a plakát, ze kterého se počítala (při změně plakátu se spočítá znovu)
  ALTER TABLE title ADD COLUMN palette TEXT;
  ALTER TABLE title ADD COLUMN palette_source TEXT;

  -- NULL = čeká, 'done' = hotovo, 'error' = nepovedlo se, 'skipped' = příliš krátké
  ALTER TABLE media_file ADD COLUMN clips_status TEXT;

  CREATE TABLE preview_clip (
    media_file_id INTEGER NOT NULL REFERENCES media_file (id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    file TEXT NOT NULL,
    PRIMARY KEY (media_file_id, idx)
  );
  `,

  // 8 – rozkoukané filmy a díly, deník zhlédnutí (episode_id NULL = film)
  `
  CREATE TABLE playback_progress (
    title_id INTEGER NOT NULL REFERENCES title (id) ON DELETE CASCADE,
    episode_id INTEGER REFERENCES episode (id) ON DELETE CASCADE,
    position REAL NOT NULL,
    duration REAL NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX playback_progress_item ON playback_progress (title_id, IFNULL(episode_id, 0));

  -- 'auto' = přehrávač (nad 90 %); ruční záznamy, hodnocení a poznámky přidá přírůstek 12
  CREATE TABLE watch_event (
    id INTEGER PRIMARY KEY,
    title_id INTEGER NOT NULL REFERENCES title (id) ON DELETE CASCADE,
    episode_id INTEGER REFERENCES episode (id) ON DELETE CASCADE,
    watched_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'auto'
  );
  CREATE INDEX watch_event_title ON watch_event (title_id);
  `,

  // 9 – zapamatovaná volba zvukové stopy (a v přírůstku 11 titulků) pro film nebo celý seriál
  `
  CREATE TABLE title_track_pref (
    title_id INTEGER NOT NULL REFERENCES title (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('audio', 'sub')),
    language TEXT,
    track_title TEXT,
    PRIMARY KEY (title_id, kind)
  );
  `,

  // 10 – posun časování titulků pro konkrétní soubor (titulky sedí k určitému vydání)
  `
  CREATE TABLE file_sub_delay (
    media_file_id INTEGER PRIMARY KEY REFERENCES media_file (id) ON DELETE CASCADE,
    delay REAL NOT NULL
  );
  `,

  // 11 – deník: poznámka ke zhlédnutí, moje hodnocení titulu (1–5 hvězd)
  `
  ALTER TABLE watch_event ADD COLUMN note TEXT;
  CREATE INDEX watch_event_time ON watch_event (watched_at);

  CREATE TABLE title_rating (
    title_id INTEGER PRIMARY KEY REFERENCES title (id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    updated_at TEXT NOT NULL
  );
  `,

  // 12 – ruční zařazení souboru (film / díl seriálu), přepíše rozpoznání z názvu souboru
  `
  CREATE TABLE file_classification (
    media_file_id INTEGER PRIMARY KEY REFERENCES media_file (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('movie', 'episode')),
    title TEXT NOT NULL,
    year INTEGER,
    season INTEGER,
    episode INTEGER,
    episode_title TEXT
  );
  `,

  // 13 – dětská část: tituly (= podsložky složky Kids) a videa v nich
  `
  CREATE TABLE kids_title (
    id INTEGER PRIMARY KEY,
    -- název podsložky je zároveň název titulu
    folder TEXT NOT NULL UNIQUE COLLATE NOCASE,
    -- další slova, podle kterých se do titulu řadí nová videa (JSON pole)
    keywords TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE kids_video (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE COLLATE NOCASE,
    -- NULL = video leží přímo ve složce Kids a k žádnému titulu se nepodařilo zařadit
    title_id INTEGER REFERENCES kids_title (id) ON DELETE SET NULL,
    youtube_id TEXT,
    -- název videa z YouTube (nebo ze jména souboru)
    name TEXT NOT NULL,
    channel TEXT,
    duration REAL,
    thumbnail TEXT,
    size INTEGER NOT NULL,
    mtime_ms INTEGER NOT NULL,
    added_at TEXT NOT NULL
  );
  CREATE INDEX kids_video_title ON kids_video (title_id);
  `,

  // 14 – dětská část: rozkoukané a zhlédnuté pohádky, oblíbené (odděleně od deníku dospělých)
  `
  CREATE TABLE kids_progress (
    video_id INTEGER PRIMARY KEY REFERENCES kids_video (id) ON DELETE CASCADE,
    position REAL NOT NULL,
    duration REAL NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE kids_watch (
    video_id INTEGER PRIMARY KEY REFERENCES kids_video (id) ON DELETE CASCADE,
    count INTEGER NOT NULL,
    last_at TEXT NOT NULL
  );

  CREATE TABLE kids_favorite (
    kind TEXT NOT NULL CHECK (kind IN ('title', 'video')),
    ref_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (kind, ref_id)
  );
  `,

  // 15 – dětská část: obrázek titulu vybraný rodičem
  `
  ALTER TABLE kids_title ADD COLUMN cover_video_id INTEGER REFERENCES kids_video (id) ON DELETE SET NULL;
  `,

  // 16 – dětská část: pořad na TMDB a jeho obrázky (aby šel titul poznat na první pohled)
  `
  -- pending = ještě nehledáno, matched = nalezeno, manual = vybráno rodičem,
  -- none = nic nenalezeno, off = rodič obrázky z TMDB vypnul
  ALTER TABLE kids_title ADD COLUMN tmdb_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE kids_title ADD COLUMN tmdb_kind TEXT;
  ALTER TABLE kids_title ADD COLUMN tmdb_id INTEGER;
  ALTER TABLE kids_title ADD COLUMN tmdb_name TEXT;
  ALTER TABLE kids_title ADD COLUMN tmdb_year INTEGER;
  -- obrázky pořadu z TMDB (JSON pole cest „/abc.jpg“), nejvhodnější do kolečka první
  ALTER TABLE kids_title ADD COLUMN artwork TEXT NOT NULL DEFAULT '[]';
  -- obrázek vybraný rodičem: „tmdb:/abc.jpg“ nebo „file:<cesta>“ (přednost před cover_video_id)
  ALTER TABLE kids_title ADD COLUMN cover_image TEXT;
  `,

  // 17 – ústřední melodie titulu vybraná ručně (soubor, odkaz z YouTube, nebo bez melodie)
  `
  CREATE TABLE title_theme (
    title_id INTEGER PRIMARY KEY REFERENCES title (id) ON DELETE CASCADE,
    -- 'file' = vybraný soubor, 'youtube' = stažený z odkazu, 'none' = bez melodie
    source TEXT NOT NULL,
    -- název souboru ve složce themes (NULL u 'none')
    file TEXT,
    -- odkaz, ze kterého se melodie stáhla
    url TEXT,
    updated_at TEXT NOT NULL
  );
  `,

  // 18 – ústřední melodie stažená automaticky (odkaz z ThemerrDB podle ID z TMDB)
  `
  CREATE TABLE title_theme_auto (
    title_id INTEGER PRIMARY KEY REFERENCES title (id) ON DELETE CASCADE,
    -- ID z TMDB, pro které se hledalo (po opravě shody se hledá znovu)
    tmdb_id INTEGER NOT NULL,
    -- 'done' = staženo, 'none' = ThemerrDB melodii nezná, 'local' = titul má vlastní soubor,
    -- 'error' = stažení nevyšlo
    status TEXT NOT NULL,
    file TEXT,
    url TEXT,
    updated_at TEXT NOT NULL
  );
  `,
  // 19 – YT videa: kategorie (podsložky složky YT) a videa v nich
  `
  CREATE TABLE yt_category (
    id INTEGER PRIMARY KEY,
    folder TEXT NOT NULL UNIQUE COLLATE NOCASE,
    -- klíčová slova pro zařazení (JSON pole textů)
    keywords TEXT NOT NULL DEFAULT '[]',
    -- záložní kategorie: 'music' = hudba bez jiné shody, 'other' = vše ostatní, NULL = běžná
    role TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE yt_video (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE COLLATE NOCASE,
    -- NULL = video v kořeni složky, které čeká na zařazení
    category_id INTEGER REFERENCES yt_category (id) ON DELETE SET NULL,
    youtube_id TEXT,
    name TEXT NOT NULL,
    channel TEXT,
    duration REAL,
    thumbnail TEXT,
    size INTEGER NOT NULL,
    mtime_ms INTEGER NOT NULL,
    added_at TEXT NOT NULL
  );
  CREATE INDEX yt_video_category ON yt_video (category_id);
  `,
  // 20 – YT videa: rozkoukaná a zhlédnutá videa (vlastní historie, do deníku se nezapisuje)
  `
  CREATE TABLE yt_progress (
    video_id INTEGER PRIMARY KEY REFERENCES yt_video (id) ON DELETE CASCADE,
    position REAL NOT NULL,
    duration REAL NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE yt_watch (
    video_id INTEGER PRIMARY KEY REFERENCES yt_video (id) ON DELETE CASCADE,
    count INTEGER NOT NULL,
    last_at TEXT NOT NULL
  );
  `
]
