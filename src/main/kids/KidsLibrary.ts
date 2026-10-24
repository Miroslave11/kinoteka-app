import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import type { KidsManageAction, KidsManageResult, KidsScanResult } from '../../shared/kids'
import { isVideoFile } from '../../shared/library'
import { diffScan, isIgnoredDir, listVideoFiles, type FoundFile } from '../library/scanner'
import { deriveTitleName, matchTitle, safeFolderName, type VideoMeta } from './classify'
import type { KidsRepository, StoredVideo, VideoRecord } from './KidsRepository'

interface KidsLibraryEvents {
  changed: []
}

export interface KidsLibraryOptions {
  folder: () => string
  /** Probíhá stahování – rozpracované soubory yt-dlp se nesmí přesouvat. */
  busy: () => boolean
  /** Délka videa (ffprobe); null = nejde zjistit. */
  probeDuration?: (path: string) => Promise<number | null>
  /** Obrázek z videa (ffmpeg) do souboru `output`. */
  makeThumbnail?: (input: string, atSec: number, output: string) => Promise<void>
  /** Kam ukládat obrázky vytvořené z videí. */
  thumbnailDir: string
  /** Do Koše (`shell.trashItem`). */
  trash?: (path: string) => Promise<void>
  /** Stahuje se (nebo na to čeká) něco do této podsložky – tu nejde přejmenovat ani smazat. */
  downloadingInto?: (folder: string) => boolean
  now?: () => Date
}

/** Srozumitelná zpráva k chybě při práci se soubory. */
export function fileError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')
    return 'Soubor je otevřený v jiném programu (třeba v přehrávači) – zavři ho a zkus to znovu.'
  if (code === 'ENOENT') return 'Soubor už na disku není – zkus složku projít znovu.'
  return (error as Error).message
}

/** Rozpracované soubory yt-dlp: „x.f398.mp4“ (obraz bez zvuku), „x.temp.mp4“ (spojování). */
const PARTIAL = /\.(f\d+|temp|part)\.[^.]+$/i
const IMAGE_EXTENSIONS = ['.jpg', '.webp', '.png']

const withoutExtension = (path: string): string => path.slice(0, path.length - extname(path).length)

/** Údaje z `.info.json` vedle videa; bez něj aspoň název a YouTube ID ze jména souboru. */
async function readVideoInfo(
  path: string
): Promise<VideoMeta & { youtubeId: string | null; duration: number | null }> {
  const base = withoutExtension(path)
  const fromName = /^(.*?)\s*\[([\w-]{11})\]$/.exec(basename(base))
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null
  let info: Record<string, unknown> = {}
  try {
    info = JSON.parse(await readFile(`${base}.info.json`, 'utf8')) as Record<string, unknown>
  } catch {
    // Video odjinud než z YouTube – stačí jméno souboru.
  }
  return {
    title: text(info['title']) ?? fromName?.[1] ?? basename(base),
    channel: text(info['channel']) ?? text(info['uploader']),
    playlist: text(info['playlist_title']),
    series: text(info['series']),
    youtubeId: text(info['id']) ?? fromName?.[2] ?? null,
    duration: typeof info['duration'] === 'number' ? info['duration'] : null
  }
}

/**
 * Knihovna dětské části: složka Kids, ve které je každá podsložka jeden titul. Videa
 * položená přímo do složky (stažená, zkopírovaná) zařadí podle údajů z YouTube a přesune
 * i s obrázkem a údaji do podsložky titulu.
 */
export class KidsLibrary extends EventEmitter<KidsLibraryEvents> {
  private running: Promise<KidsScanResult> | null = null
  /** Sken a úpravy titulů se střídají – nikdy neběží dvě práce se soubory naráz. */
  private lock: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly repository: KidsRepository,
    private readonly options: KidsLibraryOptions
  ) {
    super()
  }

  /** Projde složku; souběžná volání se spojí. */
  scan(): Promise<KidsScanResult> {
    this.running ??= this.exclusive(() => this.doScan()).finally(() => {
      this.running = null
    })
    return this.running
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.lock.then(work)
    this.lock = result.catch(() => undefined)
    return result
  }

  /** Úprava titulů a videí z části Pro rodiče (soubory na disku i záznamy). */
  async manage(action: KidsManageAction): Promise<KidsManageResult> {
    let result: KidsManageResult
    try {
      const message = await this.exclusive(() => this.apply(action))
      result = message ? { ok: false, message } : { ok: true }
    } catch (error) {
      result = { ok: false, message: fileError(error) }
    }
    this.emit('changed')
    return result
  }

  /** Vrací chybovou zprávu, nebo null = hotovo. */
  private async apply(action: KidsManageAction): Promise<string | null> {
    const root = this.options.folder()
    const repo = this.repository
    const busy = (folder: string): boolean => this.options.downloadingInto?.(folder) ?? false
    const BUSY = 'Do titulu se právě stahuje – počkej, až stahování doběhne.'
    const EXISTS = 'Titul s tímto názvem už je.'

    switch (action.kind) {
      case 'create-title': {
        const folder = safeFolderName(action.name)
        if (!folder) return 'Neplatný název.'
        if (existsSync(join(root, folder))) return EXISTS
        await mkdir(join(root, folder), { recursive: true })
        repo.ensureTitle(folder, this.now())
        return null
      }
      case 'rename-title': {
        const title = repo.title(action.titleId)
        if (!title) return 'Titul už neexistuje.'
        const folder = safeFolderName(action.name)
        if (!folder) return 'Neplatný název.'
        if (folder === title.folder) return null
        if (busy(title.folder)) return BUSY
        const sameFolder = folder.toLowerCase() === title.folder.toLowerCase()
        if (!sameFolder && existsSync(join(root, folder))) return EXISTS
        const from = join(root, title.folder)
        const to = join(root, folder)
        await rename(from, to)
        repo.renameTitle(title.id, folder)
        // Videa si nechají id – pozice, zhlédnutí i oblíbené zůstanou.
        for (const video of repo.titleVideos(title.id))
          await this.relocate(video, join(to, relative(from, video.path)))
        return null
      }
      case 'set-keywords': {
        if (!repo.title(action.titleId)) return 'Titul už neexistuje.'
        repo.setKeywords(action.titleId, action.keywords)
        return null
      }
      case 'set-cover': {
        if (!repo.title(action.titleId)) return 'Titul už neexistuje.'
        if (action.videoId !== null && repo.video(action.videoId)?.titleId !== action.titleId)
          return 'Video už v titulu není.'
        repo.setCover(action.titleId, action.videoId)
        return null
      }
      case 'trash-title': {
        const title = repo.title(action.titleId)
        if (!title) return null
        if (busy(title.folder)) return BUSY
        const videos = repo.titleVideos(title.id)
        if (existsSync(join(root, title.folder))) await this.trash(join(root, title.folder))
        repo.deleteTitle(title.id)
        await this.removeGeneratedThumbnails(videos)
        return null
      }
      case 'move-video': {
        const video = repo.video(action.videoId)
        if (!video) return 'Video už ve složce není.'
        const target = repo.title(action.titleId)
        if (!target) return 'Titul už neexistuje.'
        if (video.titleId === target.id) return null
        const targetDir = join(root, target.folder)
        await this.moveWithSidecars(video.path, await readdir(dirname(video.path)), targetDir)
        await this.relocate(video, join(targetDir, basename(video.path)))
        return null
      }
      case 'trash-video': {
        const video = repo.video(action.videoId)
        if (!video) return null
        // Nejdřív video – když je otevřené v přehrávači, obrázek a údaje zůstanou u něj.
        if (existsSync(video.path)) await this.trash(video.path)
        const dir = dirname(video.path)
        const base = basename(withoutExtension(video.path))
        for (const name of await readdir(dir).catch(() => []))
          if (name.startsWith(`${base}.`)) await this.trash(join(dir, name))
        repo.removeVideos([video.id])
        await this.removeGeneratedThumbnails([video])
        return null
      }
    }
  }

  private async trash(path: string): Promise<void> {
    if (!this.options.trash) throw new Error('Koš není k dispozici.')
    await this.options.trash(path)
  }

  /** Video je na disku jinde – nový záznam (titul, obrázek), stejné id. */
  private async relocate(video: StoredVideo, path: string): Promise<void> {
    this.repository.updateVideo(
      video.id,
      await this.record(this.options.folder(), { path, size: video.size, mtimeMs: video.mtimeMs })
    )
  }

  private async removeGeneratedThumbnails(videos: readonly StoredVideo[]): Promise<void> {
    for (const video of videos)
      await rm(join(this.options.thumbnailDir, `${video.id}.jpg`), { force: true })
  }

  private async doScan(): Promise<KidsScanResult> {
    const root = this.options.folder()
    await mkdir(root, { recursive: true })
    const errors: string[] = []
    const sorted = this.options.busy() ? 0 : await this.sortLooseVideos(root, errors)

    const listing = await listVideoFiles(root)
    listing.files = listing.files.filter((file) => !PARTIAL.test(file.path))
    const folders = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !isIgnoredDir(entry.name))
      .map((entry) => entry.name)
    for (const folder of folders) this.repository.ensureTitle(folder, this.now())

    const diff = diffScan(this.repository.storedFiles(), listing)
    for (const file of diff.added)
      this.repository.insertVideo(await this.record(root, file), this.now())
    for (const { id, file } of [...diff.updated, ...diff.moved])
      this.repository.updateVideo(id, await this.record(root, file))
    this.repository.removeVideos(diff.removed)
    this.repository.removeTitlesExcept(folders)
    this.emit('changed')

    void this.complete()
    const titles = this.repository.list()
    return {
      titles: titles.filter((t) => t.id !== null).length,
      videos: titles.reduce((sum, t) => sum + t.videos.length, 0),
      sorted,
      errors
    }
  }

  /** Záznam o videu: titul podle podsložky, údaje z `.info.json`, obrázek vedle videa. */
  private async record(
    root: string,
    file: Pick<FoundFile, 'path' | 'size' | 'mtimeMs'>
  ): Promise<VideoRecord> {
    const info = await readVideoInfo(file.path)
    const folder = relative(root, file.path).split(sep)
    const base = withoutExtension(file.path)
    const thumbnail = IMAGE_EXTENSIONS.map((ext) => base + ext).find((path) => existsSync(path))
    return {
      path: file.path,
      titleId: folder.length > 1 ? this.repository.ensureTitle(folder[0]!, this.now()) : null,
      youtubeId: info.youtubeId,
      name: info.title,
      channel: info.channel,
      duration: info.duration,
      thumbnail: thumbnail ?? null,
      size: file.size,
      mtimeMs: file.mtimeMs
    }
  }

  /** Videa přímo ve složce Kids přesune do podsložek titulů. Vrací počet přesunutých. */
  private async sortLooseVideos(root: string, errors: string[]): Promise<number> {
    const entries = await readdir(root, { withFileTypes: true })
    const names = entries.filter((e) => e.isFile()).map((e) => e.name)
    const titles = this.repository.titles().map((t) => ({ name: t.folder, keywords: t.keywords }))
    // Podsložky založené ručně v Průzkumníku jsou také tituly.
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !isIgnoredDir(entry.name) &&
        !titles.some((t) => t.name.toLowerCase() === entry.name.toLowerCase())
      )
        titles.push({ name: entry.name, keywords: [] })
    }

    let moved = 0
    for (const name of names) {
      if (!isVideoFile(name) || PARTIAL.test(name)) continue
      const path = join(root, name)
      const info = await readVideoInfo(path)
      const target = matchTitle(info, titles) ?? deriveTitleName(info)
      if (!target) continue
      const folder = safeFolderName(target)
      try {
        await this.moveWithSidecars(path, names, join(root, folder))
        if (!titles.some((t) => t.name.toLowerCase() === folder.toLowerCase()))
          titles.push({ name: folder, keywords: [] })
        moved++
      } catch (error) {
        errors.push(`${name}: ${(error as Error).message}`)
      }
    }
    return moved
  }

  /** Přesune video i soubory se stejným začátkem jména (obrázek, údaje, titulky). */
  private async moveWithSidecars(
    path: string,
    siblings: string[],
    targetDir: string
  ): Promise<void> {
    await mkdir(targetDir, { recursive: true })
    const base = basename(withoutExtension(path))
    const related = siblings.filter(
      (name) => name === basename(path) || name.startsWith(`${base}.`)
    )
    if (related.some((name) => existsSync(join(targetDir, name))))
      throw new Error('V cílové složce už stejný soubor je.')
    // Video poslední – kdyby se přesun přerušil, zůstane ve složce Kids a zkusí se znovu.
    const ordered = [...related.filter((n) => n !== basename(path)), basename(path)]
    for (const name of ordered) await rename(join(dirname(path), name), join(targetDir, name))
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
