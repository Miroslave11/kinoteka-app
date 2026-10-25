import { EventEmitter } from 'node:events'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ThemeStatus } from '../../shared/theme'
import type { Database } from '../db/database'

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * Nepovedené stažení se zkusí znovu za týden; titul bez melodie v ThemerrDB (nebo s vlastním
 * souborem melodie) za měsíc.
 */
const RETRY_ERROR_MS = 7 * DAY_MS
const RETRY_NONE_MS = 30 * DAY_MS
/** Mezi tituly krátká pauza – ThemerrDB ani YouTube není potřeba zahlcovat. */
const PAUSE_MS = 2000

interface AutoThemesEvents {
  /** Titul dostal melodii (okno ji může začít hrát). */
  downloaded: [titleId: number]
  /** Změnil se stav fronty (Nastavení › Zvuk). */
  changed: []
}

export interface AutoThemesOptions {
  db: Database
  /** Složka s melodiemi (stejná jako u ručně vybraných). */
  dir: string
  enabled: () => boolean
  /** Odkaz na melodii v ThemerrDB; null = nezná ji; výjimka = síť nefunguje. */
  lookup: (kind: 'movie' | 'show', tmdbId: number) => Promise<string | null>
  /** Stáhne zvuk z odkazu do `dir` jako `<name>.<přípona>` a vrátí název souboru. */
  download: (url: string, dir: string, name: string) => Promise<string>
  /** Má titul vlastní melodii vedle souborů? Pak se nic nestahuje. */
  hasLocalTheme: (titleId: number) => Promise<boolean>
  pauseMs?: number
  now?: () => Date
}

interface Candidate {
  id: number
  kind: 'movie' | 'show'
  tmdbId: number
}

/**
 * Automatické stahování ústředních melodií na pozadí: pro tituly spárované s TMDB, které
 * nemají ruční volbu ani vlastní soubor, najde odkaz v ThemerrDB a stáhne začátek zvuku.
 * Stahuje se vždy jen jeden titul; titul otevřený v detailu jde na řadu přednostně.
 */
export class AutoThemes extends EventEmitter<AutoThemesEvents> {
  private running: Promise<void> | null = null
  private again = false
  private readonly preferred: number[] = []

  constructor(private readonly options: AutoThemesOptions) {
    super()
  }

  run(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.loop().finally(() => {
      this.running = null
      this.emit('changed')
    })
    this.emit('changed')
    return this.running
  }

  /** Titul otevřený v detailu se stáhne jako další v pořadí. */
  prefer(titleId: number): void {
    if (!this.options.enabled() || this.preferred.includes(titleId)) return
    this.preferred.unshift(titleId)
    void this.run()
  }

  /** Automaticky stažená melodie titulu (pro ThemeService). */
  file(titleId: number): { file: string; url: string | null } | null {
    const row = this.options.db
      .prepare(
        `SELECT a.file, a.url FROM title_theme_auto a JOIN title t ON t.id = a.title_id
         WHERE a.title_id = ? AND a.status = 'done' AND a.tmdb_id = t.tmdb_id`
      )
      .get(titleId)
    return row?.['file'] ? { file: String(row['file']), url: (row['url'] as string) ?? null } : null
  }

  /** Názvy souborů, které automatické melodie používají (zbytek složky jde smazat). */
  files(): string[] {
    return this.options.db
      .prepare('SELECT file FROM title_theme_auto WHERE file IS NOT NULL')
      .all()
      .map((row) => String(row['file']))
  }

  status(): ThemeStatus {
    const count = (status: string): number =>
      Number(
        this.options.db
          .prepare('SELECT count(*) AS n FROM title_theme_auto WHERE status = ?')
          .get(status)?.['n'] ?? 0
      )
    return {
      pending: this.options.enabled() ? this.candidates().length : 0,
      downloaded: count('done'),
      missing: count('none') + count('error'),
      running: this.running !== null
    }
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      while (this.options.enabled()) {
        const next = this.next()
        if (!next) break
        const online = await this.fetchTheme(next)
        this.emit('changed')
        // Bez internetu nemá smysl zkoušet další tituly – zkusí se při dalším spuštění.
        if (!online) return
        await new Promise((resolve) => setTimeout(resolve, this.options.pauseMs ?? PAUSE_MS))
      }
    } while (this.again)
  }

  /** Další titul ke stažení – nejdřív otevřený v detailu, pak podle pořadí v knihovně. */
  private next(): Candidate | undefined {
    const candidates = this.candidates()
    while (this.preferred.length > 0) {
      const id = this.preferred.shift()!
      const found = candidates.find((candidate) => candidate.id === id)
      if (found) return found
    }
    return candidates[0]
  }

  private candidates(): Candidate[] {
    const now = (this.options.now?.() ?? new Date()).getTime()
    return this.options.db
      .prepare(
        `SELECT t.id, t.kind, t.tmdb_id FROM title t
         LEFT JOIN title_theme_auto a ON a.title_id = t.id
         WHERE t.tmdb_id IS NOT NULL
           AND t.id NOT IN (SELECT title_id FROM title_theme)
           AND EXISTS (SELECT 1 FROM media_file f WHERE f.title_id = t.id AND f.available = 1)
           AND (a.title_id IS NULL OR a.tmdb_id != t.tmdb_id
             OR (a.status = 'error' AND a.updated_at < ?)
             OR (a.status IN ('none', 'local') AND a.updated_at < ?))
         ORDER BY t.id`
      )
      .all(
        new Date(now - RETRY_ERROR_MS).toISOString(),
        new Date(now - RETRY_NONE_MS).toISOString()
      )
      .map((row) => ({
        id: Number(row['id']),
        kind: row['kind'] === 'show' ? 'show' : 'movie',
        tmdbId: Number(row['tmdb_id'])
      }))
  }

  /** Vrací false, když nefunguje síť (titul zůstane ve frontě). */
  private async fetchTheme(title: Candidate): Promise<boolean> {
    if (await this.options.hasLocalTheme(title.id)) {
      this.save(title, 'local', null, null)
      return true
    }
    let url: string | null
    try {
      url = await this.options.lookup(title.kind, title.tmdbId)
    } catch {
      return false
    }
    if (!url) {
      this.save(title, 'none', null, null)
      return true
    }
    await mkdir(this.options.dir, { recursive: true })
    try {
      const file = await this.options.download(
        url,
        this.options.dir,
        `auto-${title.id}-${Date.now()}`
      )
      this.save(title, 'done', file, url)
      this.emit('downloaded', title.id)
    } catch {
      this.save(title, 'error', null, url)
    }
    return true
  }

  private save(
    title: Candidate,
    status: 'done' | 'none' | 'local' | 'error',
    file: string | null,
    url: string | null
  ): void {
    const previous = this.options.db
      .prepare('SELECT file FROM title_theme_auto WHERE title_id = ?')
      .get(title.id)?.['file']
    this.options.db
      .prepare(
        `INSERT INTO title_theme_auto (title_id, tmdb_id, status, file, url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (title_id) DO UPDATE SET tmdb_id = excluded.tmdb_id, status = excluded.status,
           file = excluded.file, url = excluded.url, updated_at = excluded.updated_at`
      )
      .run(
        title.id,
        title.tmdbId,
        status,
        file,
        url,
        (this.options.now?.() ?? new Date()).toISOString()
      )
    // Melodie pro dřívější shodu (před opravou shody) už není potřeba.
    if (typeof previous === 'string' && previous !== file)
      void rm(join(this.options.dir, previous), { force: true })
  }
}
