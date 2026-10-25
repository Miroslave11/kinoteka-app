import { access, copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { parseYoutubeUrl } from '../../shared/kids'
import {
  THEME_EXTENSIONS,
  type ThemeInfo,
  type ThemeResult,
  type ThemeSource
} from '../../shared/theme'
import type { Database } from '../db/database'

export interface ThemeServiceOptions {
  db: Database
  /** Složka s melodiemi vybranými v aplikaci (%APPDATA%\kinoteka\themes). */
  dir: string
  /** Stáhne zvuk z odkazu do `dir` jako `<name>.<přípona>` a vrátí název souboru. */
  download: (url: string, dir: string, name: string) => Promise<string>
  /** Automaticky stažené melodie (ThemerrDB); bez nich jen ruční volba a soubory u filmů. */
  auto?: {
    file(titleId: number): { file: string; url: string | null } | null
    files(): string[]
    /** Titul nemá žádnou melodii – ať se stáhne přednostně. */
    prefer(titleId: number): void
  }
}

const NONE: ThemeInfo = { url: null, source: null, link: null }

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

const withoutExtension = (path: string): string => path.replace(/\.[^.\\/]+$/, '')

/** Melodie, kterou titul dostal ručně (vybraný soubor, odkaz, nebo „bez melodie“). */
interface Choice {
  source: Exclude<ThemeSource, 'local'>
  file: string | null
  url: string | null
}

/**
 * Ústřední melodie titulů. Přednost má ruční volba v aplikaci, pak soubor
 * „<název souboru filmu>.theme.mp3“ vedle filmu, „theme.mp3“ ve složce, ve které jsou jen
 * soubory tohoto titulu (složka seriálu, případně složka nad sériemi), a nakonec melodie
 * stažená automaticky.
 */
export class ThemeService {
  /** Poslední nalezená cesta k melodii podle titulu – pro kinoteka-media://theme/<id>. */
  private readonly paths = new Map<number, string>()

  constructor(private readonly options: ThemeServiceOptions) {}

  async info(titleId: number): Promise<ThemeInfo> {
    const choice = this.choice(titleId)
    if (choice?.source === 'none') return this.found(titleId, null, 'none', null)
    if (choice?.file) {
      const path = join(this.options.dir, choice.file)
      if (await exists(path)) return this.found(titleId, path, choice.source, choice.url)
    }
    const local = await this.localTheme(titleId)
    if (local) return this.found(titleId, local, 'local', null)
    const auto = this.options.auto?.file(titleId)
    if (auto) {
      const path = join(this.options.dir, auto.file)
      if (await exists(path)) return this.found(titleId, path, 'auto', auto.url)
    }
    if (!choice) this.options.auto?.prefer(titleId)
    return this.found(titleId, null, null, null)
  }

  /** Má titul vlastní melodii uloženou u souborů? */
  async hasLocalTheme(titleId: number): Promise<boolean> {
    return (await this.localTheme(titleId)) !== null
  }

  /** Cesta k melodii titulu (pro přehrávání); null = žádná. */
  async path(titleId: number): Promise<string | null> {
    if (!this.paths.has(titleId)) await this.info(titleId)
    return this.paths.get(titleId) ?? null
  }

  /** Vybraný zvukový soubor se zkopíruje do složky s melodiemi. */
  async chooseFile(titleId: number, source: string): Promise<ThemeResult> {
    const extension = extname(source).toLowerCase()
    if (!(THEME_EXTENSIONS as readonly string[]).includes(extension.slice(1)))
      return { ok: false, message: 'Tohle není podporovaný zvukový soubor.' }
    await mkdir(this.options.dir, { recursive: true })
    const file = `${titleId}-${Date.now()}${extension}`
    try {
      await copyFile(source, join(this.options.dir, file))
    } catch (error) {
      return { ok: false, message: `Soubor nejde zkopírovat: ${(error as Error).message}` }
    }
    await this.save(titleId, { source: 'file', file, url: null })
    return { ok: true, info: await this.info(titleId) }
  }

  /** Melodie z videa na YouTube (stáhne se jen zvuk ze začátku). */
  async chooseYoutube(titleId: number, link: string): Promise<ThemeResult> {
    const url = parseYoutubeUrl(link)
    if (!url) return { ok: false, message: 'Tohle není odkaz na video z YouTube.' }
    await mkdir(this.options.dir, { recursive: true })
    let file: string
    try {
      file = await this.options.download(url, this.options.dir, `${titleId}-${Date.now()}`)
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
    await this.save(titleId, { source: 'youtube', file, url })
    return { ok: true, info: await this.info(titleId) }
  }

  /** Titul bude bez melodie, i kdyby vedle filmu nějaká ležela. */
  async setNone(titleId: number): Promise<ThemeInfo> {
    await this.save(titleId, { source: 'none', file: null, url: null })
    return this.info(titleId)
  }

  /** Zruší ruční volbu – znovu platí soubor vedle filmu (pokud je). */
  async reset(titleId: number): Promise<ThemeInfo> {
    const previous = this.choice(titleId)
    this.options.db.prepare('DELETE FROM title_theme WHERE title_id = ?').run(titleId)
    await this.removeFile(previous?.file ?? null)
    return this.info(titleId)
  }

  /** Smaže melodie, které už žádný titul nepoužívá (titul zmizel z knihovny). */
  async removeOrphans(): Promise<void> {
    const used = new Set([
      ...this.options.db
        .prepare('SELECT file FROM title_theme WHERE file IS NOT NULL')
        .all()
        .map((row) => String(row['file'])),
      ...(this.options.auto?.files() ?? [])
    ])
    let names: string[]
    try {
      names = await readdir(this.options.dir)
    } catch {
      return
    }
    await Promise.all(
      names
        .filter((name) => !used.has(name))
        .map((name) => rm(join(this.options.dir, name), { force: true }))
    )
  }

  private choice(titleId: number): Choice | null {
    const row = this.options.db
      .prepare('SELECT source, file, url FROM title_theme WHERE title_id = ?')
      .get(titleId)
    if (!row) return null
    return {
      source: String(row['source']) as Choice['source'],
      file: row['file'] === null ? null : String(row['file']),
      url: row['url'] === null ? null : String(row['url'])
    }
  }

  private async save(titleId: number, choice: Choice): Promise<void> {
    const previous = this.choice(titleId)
    this.options.db
      .prepare(
        `INSERT INTO title_theme (title_id, source, file, url, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (title_id) DO UPDATE SET source = excluded.source, file = excluded.file,
           url = excluded.url, updated_at = excluded.updated_at`
      )
      .run(titleId, choice.source, choice.file, choice.url, new Date().toISOString())
    if (previous?.file !== choice.file) await this.removeFile(previous?.file ?? null)
  }

  private async removeFile(file: string | null): Promise<void> {
    if (file) await rm(join(this.options.dir, file), { force: true })
  }

  private async found(
    titleId: number,
    path: string | null,
    source: ThemeSource | null,
    link: string | null
  ): Promise<ThemeInfo> {
    if (!path) {
      this.paths.delete(titleId)
      return { ...NONE, source }
    }
    this.paths.set(titleId, path)
    // Verze v adrese, ať okno po změně melodie nepřehraje starou z mezipaměti.
    const version = await stat(path).then(
      (info) => Math.round(info.mtimeMs),
      () => 0
    )
    return { url: `kinoteka-media://theme/${titleId}?v=${version}`, source, link }
  }

  /** Melodie uložená u souborů titulu (vedle filmu, ve složce seriálu). */
  private async localTheme(titleId: number): Promise<string | null> {
    const files = this.options.db
      .prepare('SELECT path FROM media_file WHERE title_id = ? AND available = 1 ORDER BY path')
      .all(titleId)
      .map((row) => String(row['path']))
    if (files.length === 0) return null

    for (const file of files) {
      for (const extension of THEME_EXTENSIONS) {
        const candidate = `${withoutExtension(file)}.theme.${extension}`
        if (await exists(candidate)) return candidate
      }
    }

    // Složky souborů a složky nad nimi (seriál/Série 1/díl.mkv → seriál/theme.mp3).
    const folders = [...new Set(files.flatMap((file) => [dirname(file), dirname(dirname(file))]))]
    for (const folder of folders) {
      if (!this.ownsFolder(titleId, folder)) continue
      for (const extension of THEME_EXTENSIONS) {
        const candidate = join(folder, `theme.${extension}`)
        if (await exists(candidate)) return candidate
      }
    }
    return null
  }

  /** Jsou ve složce (i v podsložkách) jen soubory tohoto titulu? Jinak by theme.mp3 patřil všem. */
  private ownsFolder(titleId: number, folder: string): boolean {
    const prefix = folder.endsWith('\\') || folder.endsWith('/') ? folder : `${folder}\\`
    const row = this.options.db
      .prepare(
        `SELECT count(*) AS other FROM media_file
         WHERE substr(path, 1, length(?)) = ? COLLATE NOCASE AND IFNULL(title_id, -1) != ?`
      )
      .get(prefix, prefix, titleId)
    return Number(row?.['other'] ?? 1) === 0
  }
}
