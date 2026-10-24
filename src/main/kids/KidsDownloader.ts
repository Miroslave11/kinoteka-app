import { spawn as nodeSpawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { KidsDownloadProgress, KidsDownloadResult } from '../../shared/kids'
import { buildDownloadArgs, errorMessage, parseProgressLine } from './ytdlp'

interface KidsDownloaderEvents {
  progress: [KidsDownloadProgress]
}

export interface KidsDownloaderOptions {
  /** Připraví yt-dlp (stáhne, aktualizuje) a vrátí cestu k němu. */
  tool: () => Promise<string>
  folder: () => string
  ffmpegDir: string
  /** Electron, který yt-dlp spustí jako Node (ELECTRON_RUN_AS_NODE). */
  nodePath: string
  /** Pracovní složka pro pomocné soubory. */
  tempDir: string
  spawn?: typeof nodeSpawn
}

/** Údaje z `.info.json`, které vedle videa uloží yt-dlp. */
interface VideoInfo {
  title?: unknown
  channel?: unknown
  uploader?: unknown
  duration?: unknown
}

const withoutExtension = (path: string): string => path.replace(/\.[^.\\/]+$/, '')

/** Stáhne jedno video z YouTube do složky s dětskými videi (vždy jen jedno najednou). */
export class KidsDownloader extends EventEmitter<KidsDownloaderEvents> {
  private running = false

  constructor(private readonly options: KidsDownloaderOptions) {
    super()
  }

  get busy(): boolean {
    return this.running
  }

  async download(url: string): Promise<KidsDownloadResult> {
    if (this.running)
      return { ok: false, message: 'Už se stahuje jiné video – počkej, až doběhne.' }
    this.running = true
    try {
      this.emit('progress', { phase: 'tool', percent: null, speed: null, eta: null })
      let exe: string
      try {
        exe = await this.options.tool()
      } catch (error) {
        return {
          ok: false,
          message: `Nástroj yt-dlp nejde stáhnout: ${(error as Error).message}`
        }
      }
      const folder = this.options.folder()
      await mkdir(folder, { recursive: true })
      await mkdir(this.options.tempDir, { recursive: true })
      const pathFile = join(this.options.tempDir, `yt-dlp-${Date.now()}.txt`)
      try {
        return await this.run(exe, url, folder, pathFile)
      } finally {
        await rm(pathFile, { force: true })
      }
    } finally {
      this.running = false
    }
  }

  private async run(
    exe: string,
    url: string,
    folder: string,
    pathFile: string
  ): Promise<KidsDownloadResult> {
    this.emit('progress', { phase: 'starting', percent: null, speed: null, eta: null })
    const args = buildDownloadArgs({
      url,
      folder,
      ffmpegDir: this.options.ffmpegDir,
      nodePath: this.options.nodePath,
      pathFile
    })
    const child = (this.options.spawn ?? nodeSpawn)(exe, args, {
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' }
    })
    const output: string[] = []
    const onLine = (line: string): void => {
      const progress = parseProgressLine(line)
      if (progress) this.emit('progress', progress)
      else if (line.startsWith('[Merger]'))
        this.emit('progress', { phase: 'merging', percent: null, speed: null, eta: null })
      else output.push(line)
    }
    createInterface({ input: child.stdout! }).on('line', onLine)
    createInterface({ input: child.stderr! }).on('line', onLine)

    const code = await new Promise<number | null>((resolve) => {
      child.on('error', () => resolve(-1))
      child.on('close', resolve)
    })
    if (code !== 0) return { ok: false, message: errorMessage(output) }

    let file: string
    try {
      file = (await readFile(pathFile, 'utf8')).split(/\r?\n/).filter(Boolean).at(-1) ?? ''
    } catch {
      file = ''
    }
    if (!file) return { ok: false, message: errorMessage(output) }
    return { ok: true, ...(await this.describe(file)) }
  }

  /** Název, kanál, délka a náhled z `.info.json` a `.jpg`, které leží vedle videa. */
  private async describe(file: string): Promise<{
    title: string
    channel: string | null
    durationSec: number | null
    fileName: string
    thumbnail: string | null
  }> {
    const base = withoutExtension(file)
    let info: VideoInfo = {}
    try {
      info = JSON.parse(await readFile(`${base}.info.json`, 'utf8')) as VideoInfo
    } catch {
      // Bez údajů se použije aspoň název souboru.
    }
    let thumbnail: string | null
    try {
      thumbnail = `data:image/jpeg;base64,${(await readFile(`${base}.jpg`)).toString('base64')}`
    } catch {
      thumbnail = null
    }
    const text = (value: unknown): string | null =>
      typeof value === 'string' && value.trim() ? value.trim() : null
    return {
      title: text(info.title) ?? basename(base),
      channel: text(info.channel) ?? text(info.uploader),
      durationSec: typeof info.duration === 'number' ? Math.round(info.duration) : null,
      fileName: basename(file),
      thumbnail
    }
  }
}
