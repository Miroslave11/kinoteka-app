import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { YtManageAction, YtManageResult, YtScanResult } from '../../shared/yt'
import { isVideoFile } from '../../shared/library'
import { safeFolderName } from '../kids/classify'
import { fileError } from '../kids/KidsLibrary'
import { diffScan, isIgnoredDir, listVideoFiles, type FoundFile } from '../library/scanner'
import {
  findSidecarImage,
  infoJsonPath,
  infoText,
  moveWithSidecars,
  nameAndYoutubeId,
  PARTIAL_DOWNLOAD,
  readInfoJson
} from '../library/videoSidecars'
import {
  DEFAULT_CATEGORIES,
  defaultsFor,
  fallbackRole,
  matchCategory,
  metaFromInfo
} from './ytClassify'
import type { YtRepository, YtVideoRecord } from './YtRepository'

interface YtLibraryEvents {
  changed: []
}

/** Výsledek dotažení údajů o videu z YouTube. */
export type FetchInfoResult =
  | { ok: true; info: Record<string, unknown> }
  /** retry = chyba spojení (zkusí se příště), jinak video na YouTube není a řadí se podle názvu. */
  | { ok: false; retry: boolean; message: string }

export interface YtLibraryOptions {
  folder: () => string
  /** Údaje o videu z YouTube podle ID (yt-dlp, bez stahování). */
  fetchInfo?: (youtubeId: string) => Promise<FetchInfoResult>
  /** Délka videa (ffprobe); null = nejde zjistit. */
  probeDuration?: (path: string) => Promise<number | null>
  /** Obrázek z videa (ffmpeg) do souboru `output`. */
  makeThumbnail?: (input: string, atSec: number, output: string) => Promise<void>
  /** Kam ukládat obrázky vytvořené z videí. */
  thumbnailDir: string
  now?: () => Date
}

/** Z údajů yt-dlp se uloží jen to, co aplikace potřebuje (celý výpis má stovky kB). */
const KEPT_INFO_FIELDS = [
  'id',
  'title',
  'channel',
  'uploader',
  'duration',
  'tags',
  'categories',
  'description',
  'playlist_title'
]

/**
 * Knihovna YT videí: složka, ve které je každá podsložka jedna kategorie (Města, Příroda…).
 * Videa položená přímo do složky zařadí podle obsahu (štítky, název, popis, kanál z YouTube)
 * a přesune i s obrázkem a údaji do podsložky kategorie. Videím, ke kterým údaje chybí, ale
 * v názvu souboru mají YouTube ID, je nejdřív dotáhne.
 */
export class YtLibrary extends EventEmitter<YtLibraryEvents> {
  private running: Promise<YtScanResult> | null = null
  private lock: Promise<unknown> = Promise.resolve()
  private fetching: Promise<void> | null = null
  /** Videa, ke kterým YouTube údaje nedá (smazaná, soukromá) – řadí se jen podle názvu. */
  private readonly withoutInfo = new Set<string>()
  /** Videa v kořeni složky, ke kterým se mají dotáhnout údaje (cesta → YouTube ID). */
  private waiting = new Map<string, string>()

  constructor(
    private readonly repository: YtRepository,
    private readonly options: YtLibraryOptions
  ) {
    super()
  }

  /** Projde složku; souběžná volání se spojí. */
  scan(): Promise<YtScanResult> {
    this.running ??= this.exclusive(() => this.doScan()).finally(() => {
      this.running = null
    })
    return this.running
  }

  /** Kolik videí ještě čeká na údaje z YouTube. */
  get pendingInfo(): number {
    return this.waiting.size
  }

  /** Dotahování údajů (pro testy – počkat, až doběhne). */
  idle(): Promise<void> {
    return this.fetching ?? Promise.resolve()
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.lock.then(work)
    this.lock = result.catch(() => undefined)
    return result
  }

  async manage(action: YtManageAction): Promise<YtManageResult> {
    let result: YtManageResult
    try {
      const message = await this.exclusive(() => this.apply(action))
      result = message ? { ok: false, message } : { ok: true }
    } catch (error) {
      result = { ok: false, message: fileError(error) }
    }
    this.emit('changed')
    return result
  }

  private async apply(action: YtManageAction): Promise<string | null> {
    const root = this.options.folder()
    switch (action.kind) {
      case 'create-category': {
        const folder = safeFolderName(action.name)
        if (existsSync(join(root, folder))) return 'Kategorie s tímto názvem už je.'
        await mkdir(join(root, folder), { recursive: true })
        this.repository.ensureCategory(folder, defaultsFor(folder), this.now())
        return null
      }
      case 'set-keywords': {
        if (!this.repository.category(action.categoryId)) return 'Kategorie už neexistuje.'
        this.repository.setKeywords(action.categoryId, action.keywords)
        return null
      }
    }
  }

  private async doScan(): Promise<YtScanResult> {
    const root = this.options.folder()
    await mkdir(root, { recursive: true })
    const errors: string[] = []
    await this.prepareCategories(root)
    const sorted = await this.sortLooseVideos(root, errors)

    const listing = await listVideoFiles(root)
    listing.files = listing.files.filter((file) => !PARTIAL_DOWNLOAD.test(file.path))
    const folders = await this.categoryFolders(root)
    const diff = diffScan(this.repository.storedFiles(), listing)
    for (const file of diff.added)
      this.repository.insertVideo(await this.record(root, file), this.now())
    for (const { id, file } of [...diff.updated, ...diff.moved])
      this.repository.updateVideo(id, await this.record(root, file))
    this.repository.removeVideos(diff.removed)
    this.repository.removeCategoriesExcept(folders)
    this.emit('changed')

    void this.complete()
    if (this.waiting.size > 0) void this.fetchMissing()
    const categories = this.repository.list()
    return {
      categories: categories.filter((c) => c.id !== null).length,
      videos: categories.reduce((sum, c) => sum + c.videos.length, 0),
      sorted,
      errors
    }
  }

  private async categoryFolders(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !isIgnoredDir(entry.name))
      .map((entry) => entry.name)
  }

  /**
   * Podsložky = kategorie. Ve složce bez podsložek (nová, prázdná) založí výchozí kategorie;
   * ručně založené podsložky dostanou výchozí klíčová slova, když se jmenují jako výchozí.
   */
  private async prepareCategories(root: string): Promise<void> {
    let folders = await this.categoryFolders(root)
    if (folders.length === 0) {
      for (const category of DEFAULT_CATEGORIES)
        await mkdir(join(root, category.name), { recursive: true })
      folders = DEFAULT_CATEGORIES.map((c) => c.name)
    }
    for (const folder of folders)
      this.repository.ensureCategory(folder, defaultsFor(folder), this.now())
  }

  /** Záznam o videu: kategorie podle podsložky, údaje z `.info.json`, obrázek vedle videa. */
  private async record(
    root: string,
    file: Pick<FoundFile, 'path' | 'size' | 'mtimeMs'>
  ): Promise<YtVideoRecord> {
    const fromName = nameAndYoutubeId(file.path)
    const info = (await readInfoJson(file.path)) ?? {}
    const folder = relative(root, file.path).split(sep)
    return {
      path: file.path,
      categoryId:
        folder.length > 1
          ? this.repository.ensureCategory(folder[0]!, defaultsFor(folder[0]!), this.now())
          : null,
      youtubeId: infoText(info['id']) ?? fromName.youtubeId,
      name: infoText(info['title']) ?? fromName.name,
      channel: infoText(info['channel']) ?? infoText(info['uploader']),
      duration: typeof info['duration'] === 'number' ? info['duration'] : null,
      thumbnail: findSidecarImage(file.path),
      size: file.size,
      mtimeMs: file.mtimeMs
    }
  }

  /** Videa přímo ve složce přesune do kategorií. Vrací počet přesunutých. */
  private async sortLooseVideos(root: string, errors: string[]): Promise<number> {
    const names = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
    const waiting = new Map<string, string>()
    let moved = 0
    for (const name of names) {
      if (!isVideoFile(name) || PARTIAL_DOWNLOAD.test(name)) continue
      const path = join(root, name)
      const info = await readInfoJson(path)
      const { name: fileTitle, youtubeId } = nameAndYoutubeId(path)
      if (!info && youtubeId && this.options.fetchInfo && !this.withoutInfo.has(path)) {
        waiting.set(path, youtubeId)
        continue
      }
      const target = this.targetFolder(metaFromInfo(info, fileTitle))
      try {
        await moveWithSidecars(path, names, join(root, target))
        this.repository.ensureCategory(target, defaultsFor(target), this.now())
        moved++
      } catch (error) {
        errors.push(`${name}: ${fileError(error)}`)
      }
    }
    this.waiting = waiting
    return moved
  }

  /** Podsložka pro video: kategorie podle obsahu, jinak záložní (hudba / ostatní). */
  private targetFolder(meta: ReturnType<typeof metaFromInfo>): string {
    const categories = this.repository.categories()
    const matched = matchCategory(meta, categories)
    if (matched) return matched
    const role = fallbackRole(meta)
    return (
      categories.find((c) => c.role === role)?.folder ??
      DEFAULT_CATEGORIES.find((c) => c.role === role)!.name
    )
  }

  /** Dotáhne z YouTube údaje videím v kořeni složky a pak je zařadí (nový sken). */
  private fetchMissing(): Promise<void> {
    this.fetching ??= (async () => {
      let changed = false
      for (const [path, youtubeId] of this.waiting) {
        if (!existsSync(path)) continue
        const result = await this.options.fetchInfo!(youtubeId)
        if (result.ok) {
          const kept = Object.fromEntries(
            KEPT_INFO_FIELDS.filter((key) => key in result.info).map((key) => [
              key,
              result.info[key]
            ])
          )
          await writeFile(infoJsonPath(path), JSON.stringify(kept, null, 1), 'utf8')
        } else if (result.retry) {
          // Bez připojení nemá smysl zkoušet další – video počká na příští sken.
          console.warn(`YT videa: údaje k ${youtubeId} nejde dotáhnout: ${result.message}`)
          break
        } else this.withoutInfo.add(path)
        changed = true
      }
      if (!changed) return
      // Sken, který dotahování spustil, ještě může dobíhat – jinak by se nový nespustil.
      await this.running?.catch(() => undefined)
      await this.scan()
    })()
      .catch((error: Error) => console.warn(`YT videa: ${error.message}`))
      .finally(() => {
        this.fetching = null
      })
    return this.fetching
  }

  /** Doplní délku (ffprobe) a obrázek (ffmpeg) videím, ke kterým je YouTube nedal. */
  private async complete(): Promise<void> {
    let changed = false
    for (const video of this.repository.incomplete()) {
      let duration = video.duration
      if (duration === null && this.options.probeDuration) {
        duration = await this.options.probeDuration(video.path).catch(() => null)
        if (duration !== null) {
          this.repository.setDuration(video.id, duration)
          changed = true
        }
      }
      if (!video.thumbnail && this.options.makeThumbnail) {
        const output = join(this.options.thumbnailDir, `${video.id}.jpg`)
        try {
          await mkdir(this.options.thumbnailDir, { recursive: true })
          if (!existsSync(output))
            await this.options.makeThumbnail(
              video.path,
              Math.min(60, (duration ?? 0) * 0.1),
              output
            )
          if ((await stat(output)).size > 0) {
            this.repository.setThumbnail(video.id, output)
            changed = true
          }
        } catch {
          // Bez obrázku se zobrazí barevný zástupný přechod.
        }
      }
    }
    if (changed) this.emit('changed')
  }
}
