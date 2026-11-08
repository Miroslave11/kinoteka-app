import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, rmdir, stat, utimes, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { YtManageAction, YtManageResult, YtScanResult } from '../../shared/yt'
import { isVideoFile } from '../../shared/library'
import { safeFolderName } from '../kids/classify'
import { fileError } from '../kids/KidsLibrary'
import { diffScan, isIgnoredDir, listVideoFiles, type FoundFile } from '../library/scanner'
import {
  findSidecarImage,
  infoJsonPath,
  infoText,
  isOnlineFile,
  moveWithSidecars,
  nameAndYoutubeId,
  ONLINE_EXTENSION,
  PARTIAL_DOWNLOAD,
  readInfoJson,
  withoutExtension
} from '../library/videoSidecars'
import {
  DEFAULT_CATEGORIES,
  defaultsFor,
  fallbackRole,
  matchCategory,
  metaFromInfo
} from './ytClassify'
import type { StoredCategory, StoredYtVideo, YtRepository, YtVideoRecord } from './YtRepository'

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
  /** Do Koše (`shell.trashItem`). */
  trash?: (path: string) => Promise<void>
  /** Probíhá stahování – videa v kořeni se netřídí (yt-dlp s nimi ještě může pracovat). */
  busy?: () => boolean
  /** Náhled videa z YouTube (jpg) pro online video; null = nejde stáhnout. */
  fetchThumbnail?: (youtubeId: string) => Promise<Uint8Array | null>
  /** Stahuje se (nebo na to čeká) něco do této podsložky – tu nejde přejmenovat ani smazat. */
  downloadingInto?: (folder: string) => boolean
  now?: () => Date
}

/** Stažené video nebo online video (soubor s odkazem). */
const isMedia = (name: string): boolean => isVideoFile(name) || isOnlineFile(name)

/** Uloží vedle videa jen potřebné údaje z výpisu yt-dlp (celý má stovky kB). */
export async function writeSlimInfo(
  mediaPath: string,
  info: Record<string, unknown>
): Promise<void> {
  const kept = Object.fromEntries(
    KEPT_INFO_FIELDS.filter((key) => key in info).map((key) => [key, info[key]])
  )
  await writeFile(infoJsonPath(mediaPath), JSON.stringify(kept, null, 1), 'utf8')
}

/** Online video k přidání: YouTube ID a název (z náhledu nebo playlistu). */
export interface OnlineEntry {
  youtubeId: string
  title: string
}

/** Smaže prázdné složky (i vnořené); složku s čímkoli dalším nechá být. */
async function removeEmptyTree(dir: string): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) if (entry.isDirectory()) await removeEmptyTree(join(dir, entry.name))
  await rmdir(dir).catch(() => undefined)
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
  /** Procházení naplánované po tom běžícím (viz {@link YtLibrary.scan}). */
  private followUp: Promise<YtScanResult> | null = null
  private lock: Promise<unknown> = Promise.resolve()
  private fetching: Promise<void> | null = null
  /** Kolik místa uvolnil poslední převod na online (výsledek `manage`). */
  private freedBytes = 0
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

  /**
   * Projde složku. Běží-li už procházení, proběhne po něm ještě jedno (to běžící mohlo
   * přehlédnout právě dostažené video); další volání mezitím se k němu připojí.
   */
  scan(): Promise<YtScanResult> {
    if (this.running) {
      this.followUp ??= this.running
        .catch(() => undefined)
        .then(() => {
          this.followUp = null
          return this.scan()
        })
      return this.followUp
    }
    this.running = this.exclusive(() => this.doScan()).finally(() => {
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
    this.freedBytes = 0
    try {
      const message = await this.exclusive(() => this.apply(action))
      result = message
        ? { ok: false, message }
        : this.freedBytes > 0
          ? { ok: true, freedBytes: this.freedBytes }
          : { ok: true }
    } catch (error) {
      result = { ok: false, message: fileError(error) }
    }
    this.emit('changed')
    // Videa ze smazané kategorie leží v kořeni – zařadí je nový sken.
    if (result.ok && action.kind === 'delete-category') await this.scan()
    return result
  }

  private async apply(action: YtManageAction): Promise<string | null> {
    const root = this.options.folder()
    const BUSY = 'Do kategorie se právě stahuje – počkej, až stahování doběhne.'
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
      case 'rename-category': {
        const category = this.repository.category(action.categoryId)
        if (!category) return 'Kategorie už neexistuje.'
        const folder = safeFolderName(action.name)
        if (folder === category.folder) return null
        if (this.busy(category.folder)) return BUSY
        const sameFolder = folder.toLowerCase() === category.folder.toLowerCase()
        if (!sameFolder && existsSync(join(root, folder))) return 'Kategorie s tímto názvem už je.'
        const from = join(root, category.folder)
        const to = join(root, folder)
        await rename(from, to)
        this.repository.renameCategory(category.id, folder)
        // Videa si nechají id – pozice i zhlédnutí zůstanou.
        for (const video of this.repository.categoryVideos(category.id))
          await this.relocate(video, join(to, relative(from, video.path)))
        return null
      }
      case 'delete-category': {
        const category = this.repository.category(action.categoryId)
        if (!category) return null
        if (category.role)
          return 'Záložní kategorii nejde smazat – patří sem videa, která jinam nepasují.'
        if (this.busy(category.folder)) return BUSY
        const dir = join(root, category.folder)
        for (const video of this.repository.categoryVideos(category.id)) {
          await moveWithSidecars(video.path, await readdir(dirname(video.path)), root)
          await this.relocate(video, join(root, basename(video.path)))
        }
        await removeEmptyTree(dir)
        // Zbylo v ní něco jiného než videa (poznámky, obrázky) – do Koše, nic se neztratí.
        if (existsSync(dir)) await this.trash(dir)
        this.repository.deleteCategory(category.id)
        return null
      }
      case 'move-video': {
        const video = this.repository.video(action.videoId)
        if (!video) return 'Video už ve složce není.'
        const target = this.repository.category(action.categoryId)
        if (!target) return 'Kategorie už neexistuje.'
        if (video.categoryId === target.id) return null
        const targetDir = join(root, target.folder)
        await moveWithSidecars(video.path, await readdir(dirname(video.path)), targetDir)
        await this.relocate(video, join(targetDir, basename(video.path)))
        return null
      }
      case 'keep-online': {
        const video = this.repository.video(action.videoId)
        if (!video) return 'Video už ve složce není.'
        if (isOnlineFile(video.path)) return null
        if (!video.youtubeId)
          return 'Video nemá odkaz na YouTube (v názvu souboru chybí ID) – online ho ponechat nejde.'
        await this.toOnline(video)
        return null
      }
      case 'keep-online-category': {
        if (!this.repository.category(action.categoryId)) return 'Kategorie už neexistuje.'
        for (const video of this.repository.categoryVideos(action.categoryId))
          if (video.youtubeId && !isOnlineFile(video.path)) await this.toOnline(video)
        return null
      }
      case 'trash-video': {
        const video = this.repository.video(action.videoId)
        if (!video) return null
        // Nejdřív video – když je otevřené v přehrávači, obrázek a údaje zůstanou u něj.
        if (existsSync(video.path)) await this.trash(video.path)
        const dir = dirname(video.path)
        const base = basename(withoutExtension(video.path))
        for (const name of await readdir(dir).catch(() => []))
          if (name.startsWith(`${base}.`)) await this.trash(join(dir, name))
        this.repository.removeVideos([video.id])
        await rm(join(this.options.thumbnailDir, `${video.id}.jpg`), { force: true })
        return null
      }
    }
  }

  /**
   * Stažené video → online: vedle videa vznikne odkaz, video jde do Koše. Údaje, obrázek
   * i pozice zůstanou (stejný záznam, jen jiný soubor).
   */
  private async toOnline(video: StoredYtVideo): Promise<void> {
    const base = withoutExtension(video.path)
    const onlinePath = base + ONLINE_EXTENSION
    if (!existsSync(onlinePath)) {
      const link = {
        url: `https://www.youtube.com/watch?v=${video.youtubeId}`,
        id: video.youtubeId,
        addedAt: this.now().toISOString()
      }
      await writeFile(onlinePath, JSON.stringify(link, null, 1), 'utf8')
    }
    if (!findSidecarImage(video.path) && this.options.fetchThumbnail) {
      const image = await this.options.fetchThumbnail(video.youtubeId!).catch(() => null)
      if (image) await writeFile(`${base}.jpg`, image)
    }
    try {
      await this.trash(video.path)
    } catch (error) {
      // Video zůstalo (je otevřené) – odkaz navíc by vedl na dva záznamy.
      await rm(onlinePath, { force: true })
      throw error
    }
    const file = await stat(onlinePath)
    this.repository.updateVideo(
      video.id,
      await this.record(this.options.folder(), {
        path: onlinePath,
        size: file.size,
        mtimeMs: Math.floor(file.mtimeMs)
      })
    )
    await rm(join(this.options.thumbnailDir, `${video.id}.jpg`), { force: true })
    this.freedBytes += video.size
  }

  /**
   * Online video, které se mezitím stáhlo do počítače (Stáhnout do počítače): záznam
   * odkazu převezme stažený soubor (pozice a zhlédnutí zůstanou) a odkaz se smaže.
   */
  private async mergeDownloaded(root: string): Promise<void> {
    const online = (await listVideoFiles(root, undefined, isOnlineFile)).files
    if (online.length === 0) return
    const downloaded = new Map<string, string>()
    for (const file of (await listVideoFiles(root)).files) {
      if (PARTIAL_DOWNLOAD.test(file.path)) continue
      const { youtubeId } = nameAndYoutubeId(file.path)
      if (youtubeId) downloaded.set(youtubeId, file.path)
    }
    const stored = this.repository.storedFiles()
    for (const file of online) {
      const { youtubeId } = nameAndYoutubeId(file.path)
      const videoPath = youtubeId ? downloaded.get(youtubeId) : undefined
      if (!videoPath) continue
      const record = stored.find((s) => s.path.toLowerCase() === file.path.toLowerCase())
      const already = stored.some((s) => s.path.toLowerCase() === videoPath.toLowerCase())
      if (record && !already) {
        const info = await stat(videoPath)
        this.repository.updateVideo(
          record.id,
          await this.record(root, {
            path: videoPath,
            size: info.size,
            mtimeMs: Math.floor(info.mtimeMs)
          })
        )
      }
      // Odkaz a jeho obrázek s údaji pryč (stažené video má vlastní, když se jmenuje jinak).
      const onlineBase = withoutExtension(file.path)
      const videoBase = withoutExtension(videoPath)
      await rm(file.path, { force: true })
      if (onlineBase.toLowerCase() !== videoBase.toLowerCase())
        for (const ext of ['.jpg', '.webp', '.png', '.info.json'])
          await rm(onlineBase + ext, { force: true })
    }
  }

  private busy(folder: string): boolean {
    return this.options.downloadingInto?.(folder) ?? false
  }

  private async trash(path: string): Promise<void> {
    if (!this.options.trash) throw new Error('Koš není k dispozici.')
    await this.options.trash(path)
  }

  /** Video je na disku jinde – nový záznam (kategorie, obrázek), stejné id. */
  private async relocate(video: StoredYtVideo, path: string): Promise<void> {
    this.repository.updateVideo(
      video.id,
      await this.record(this.options.folder(), { path, size: video.size, mtimeMs: video.mtimeMs })
    )
  }

  private async doScan(): Promise<YtScanResult> {
    const root = this.options.folder()
    await mkdir(root, { recursive: true })
    const errors: string[] = []
    await this.prepareCategories(root)
    // Během stahování se kořen netřídí – yt-dlp v něm dokončuje soubory (stažení pak skenuje znovu).
    const busy = this.options.busy?.() ?? false
    const sorted = busy ? 0 : await this.sortLooseVideos(root, errors)
    if (!busy) await this.mergeDownloaded(root)

    const listing = await listVideoFiles(root, undefined, isMedia)
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
      if (!isMedia(name) || PARTIAL_DOWNLOAD.test(name)) continue
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
        if (result.ok) await writeSlimInfo(path, result.info)
        else if (result.retry) {
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

  /**
   * Přidá videa jako online (soubor s odkazem + náhled, žádné stahování). `category` prázdná =
   * do kořene složky, odkud se po dotažení údajů zařadí podle obsahu; jinak rovnou do kategorie
   * (údaje se dotáhnou na pozadí). Už přidaná nebo stažená videa přeskočí.
   */
  async addOnline(
    entries: readonly OnlineEntry[],
    category: string
  ): Promise<{ added: number; skipped: number }> {
    const root = this.options.folder()
    const dir = category ? join(root, safeFolderName(category)) : root
    const created: string[] = []
    await this.exclusive(async () => {
      await mkdir(dir, { recursive: true })
      for (const entry of entries) {
        if (!/^[\w-]{11}$/.test(entry.youtubeId)) continue
        if (this.repository.categoryOfYoutubeId(entry.youtubeId) !== null) continue
        const base = join(
          dir,
          `${safeFolderName(entry.title || entry.youtubeId)} [${entry.youtubeId}]`
        )
        const path = base + ONLINE_EXTENSION
        if (existsSync(path)) continue
        const image = await this.options.fetchThumbnail?.(entry.youtubeId).catch(() => null)
        if (image) await writeFile(`${base}.jpg`, image)
        const link = {
          url: `https://www.youtube.com/watch?v=${entry.youtubeId}`,
          id: entry.youtubeId,
          addedAt: this.now().toISOString()
        }
        await writeFile(path, JSON.stringify(link, null, 1), 'utf8')
        created.push(path)
      }
    })
    await this.scan()
    // V kategorii se údaje (délka, kanál, štítky) dotáhnou na pozadí; v kořeni to udělá sken.
    if (category && created.length > 0) void this.enrich(created)
    return { added: created.length, skipped: entries.length - created.length }
  }

  // ---------- sdílení mezi počítači (src/main/sync/ytSync.ts) ----------

  /** Kategorie podle názvu (chybějící se založí jako složka) a její klíčová slova. */
  async syncCategory(name: string, keywords: readonly string[]): Promise<void> {
    await this.exclusive(async () => {
      const category = await this.ensureSyncCategory(name)
      if (JSON.stringify(category.keywords) !== JSON.stringify(keywords))
        this.repository.setKeywords(category.id, keywords)
    })
  }

  /** Kategorie smazaná na jiném počítači (záložní kategorie zůstávají). */
  async syncDeleteCategory(name: string): Promise<void> {
    const category = this.repository.categoryByName(name)
    if (!category || category.role) return
    const result = await this.manage({ kind: 'delete-category', categoryId: category.id })
    if (!result.ok) throw new Error(result.message)
  }

  /**
   * Video z jiného počítače: když tu je (stažené nebo online), jen se přesune do jeho
   * kategorie; jinak vznikne online video s údaji, které poslal druhý počítač (bez yt-dlp).
   */
  async syncVideo(video: {
    youtubeId: string
    name: string
    channel: string | null
    durationSec: number | null
    category: string | null
  }): Promise<void> {
    if (!/^[\w-]{11}$/.test(video.youtubeId)) return
    // Na druhém PC ještě nezařazené – tady nic nepřesouvat ani nepřidávat (přijde s kategorií).
    const categoryName = video.category
    if (categoryName === null) return
    const message = await this.exclusive(async () => {
      const category = await this.ensureSyncCategory(categoryName)
      const existing = this.repository.videosByYoutubeId(video.youtubeId)
      if (existing.length > 0) {
        for (const local of existing)
          if (local.categoryId !== category.id) {
            const failed = await this.apply({
              kind: 'move-video',
              videoId: local.id,
              categoryId: category.id
            })
            if (failed) return failed
          }
        return null
      }
      const dir = join(this.options.folder(), category.folder)
      const base = join(
        dir,
        `${safeFolderName(video.name || video.youtubeId)} [${video.youtubeId}]`
      )
      const path = base + ONLINE_EXTENSION
      if (existsSync(path)) return null
      const image = await this.options.fetchThumbnail?.(video.youtubeId).catch(() => null)
      if (image) await writeFile(`${base}.jpg`, image)
      await writeSlimInfo(path, {
        id: video.youtubeId,
        title: video.name,
        ...(video.channel ? { channel: video.channel } : {}),
        ...(video.durationSec !== null ? { duration: video.durationSec } : {})
      })
      const link = {
        url: `https://www.youtube.com/watch?v=${video.youtubeId}`,
        id: video.youtubeId,
        addedAt: this.now().toISOString()
      }
      await writeFile(path, JSON.stringify(link, null, 1), 'utf8')
      return null
    })
    if (message) throw new Error(message)
  }

  /** Video smazané na jiném počítači – tady jde do Koše (stažené i online). */
  async syncDeleteVideo(youtubeId: string): Promise<void> {
    for (const video of this.repository.videosByYoutubeId(youtubeId)) {
      const result = await this.manage({ kind: 'trash-video', videoId: video.id })
      if (!result.ok) throw new Error(result.message)
    }
  }

  private async ensureSyncCategory(name: string): Promise<StoredCategory> {
    const existing = this.repository.categoryByName(name)
    if (existing) return existing
    const folder = safeFolderName(name)
    await mkdir(join(this.options.folder(), folder), { recursive: true })
    const id = this.repository.ensureCategory(folder, defaultsFor(folder), this.now())
    return this.repository.category(id)!
  }

  /** Dotáhne údaje online videím v kategorii a obnoví jejich záznamy. */
  private async enrich(paths: readonly string[]): Promise<void> {
    if (!this.options.fetchInfo) return
    for (const path of paths) {
      const { youtubeId } = nameAndYoutubeId(path)
      if (!youtubeId || !existsSync(path) || (await readInfoJson(path))) continue
      const result = await this.options.fetchInfo(youtubeId)
      if (!result.ok) {
        if (result.retry) break
        continue
      }
      await writeSlimInfo(path, result.info)
      // Nové datum souboru = sken záznam načte znovu (název, kanál, délka z údajů).
      const now = new Date()
      await utimes(path, now, now).catch(() => undefined)
    }
    await this.scan().catch(() => undefined)
  }

  /** Doplní délku (ffprobe) a obrázek (ffmpeg) videím, ke kterým je YouTube nedal. */
  private async complete(): Promise<void> {
    let changed = false
    for (const video of this.repository.incomplete()) {
      // Online video na disku není – délku má z údajů YouTube, obrázek z náhledu.
      if (isOnlineFile(video.path)) continue
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
