import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import type { KidsScanResult } from '../../shared/kids'
import { isVideoFile } from '../../shared/library'
import { diffScan, isIgnoredDir, listVideoFiles, type FoundFile } from '../library/scanner'
import { deriveTitleName, matchTitle, safeFolderName, type VideoMeta } from './classify'
import type { KidsRepository, VideoRecord } from './KidsRepository'

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
  now?: () => Date
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

  constructor(
    private readonly repository: KidsRepository,
    private readonly options: KidsLibraryOptions
  ) {
    super()
  }

  /** Projde složku; souběžná volání se spojí. */
  scan(): Promise<KidsScanResult> {
    this.running ??= this.doScan().finally(() => {
      this.running = null
    })
    return this.running
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
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
  private async record(root: string, file: FoundFile): Promise<VideoRecord> {
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
      throw new Error('v cílové složce už stejný soubor je')
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
