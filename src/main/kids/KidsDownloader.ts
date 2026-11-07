import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import type {
  KidsDownloadProgress,
  KidsDownloadResult,
  KidsPreviewStage,
  KidsQuality
} from '../../shared/kids'
import {
  buildDownloadArgs,
  buildInfoArgs,
  errorMessage,
  parseInfo,
  parseProgressLine,
  type VideoInfo
} from './ytdlp'

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
interface InfoJson {
  title?: unknown
  channel?: unknown
  uploader?: unknown
  duration?: unknown
}

/** Náhled přes yt-dlp na pomalém počítači trvá i minutu – déle už něco visí. */
const INFO_TIMEOUT_MS = 3 * 60 * 1000
/** Zkušební spuštění yt-dlp předem (Windows Defender si nový program prověří). */
const WARM_UP_TIMEOUT_MS = 2 * 60 * 1000

/** Náhled zrušený novějším náhledem. */
export const PREVIEW_CANCELED = 'Náhled byl zrušen.'

const withoutExtension = (path: string): string => path.replace(/\.[^.\\/]+$/, '')

/** Stáhne jedno video z YouTube do složky s dětskými videi (vždy jen jedno najednou). */
export class KidsDownloader extends EventEmitter<KidsDownloaderEvents> {
  private running = false
  private child: ChildProcess | null = null
  private canceled = false
  private warm: Promise<void> | null = null
  /** Všechny běžící yt-dlp (náhledy, stahování) – při zavření aplikace se ukončí. */
  private readonly children = new Set<ChildProcess>()

  constructor(private readonly options: KidsDownloaderOptions) {
    super()
  }

  get busy(): boolean {
    return this.running
  }

  private spawnYtDlp(exe: string, args: string[]): ChildProcess {
    const child = (this.options.spawn ?? nodeSpawn)(exe, args, {
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' }
    })
    this.children.add(child)
    const forget = (): void => void this.children.delete(child)
    child.on('error', forget)
    child.on('close', forget)
    return child
  }

  /**
   * Ukončí všechny běžící yt-dlp (při zavření aplikace). Jinak by běžely dál bez okna
   * a na slabém počítači zabíraly procesor.
   */
  stopAll(): void {
    for (const child of this.children) killTree(child, this.options.spawn ?? nodeSpawn)
    this.children.clear()
  }

  private async prepareTool(): Promise<string> {
    try {
      return await this.options.tool()
    } catch (error) {
      throw new Error(`Nástroj yt-dlp nejde stáhnout: ${(error as Error).message}`, {
        cause: error
      })
    }
  }

  /**
   * Počká na konec procesu. Po `timeoutMs` nebo zrušení (`signal`) ho i s podprocesy
   * ukončí a vrátí 'timeout' / 'canceled'.
   */
  private finished(
    child: ChildProcess,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<number | null | 'timeout' | 'canceled'> {
    return new Promise((resolve) => {
      const settle = (result: number | null | 'timeout' | 'canceled'): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const stop = (reason: 'timeout' | 'canceled'): void => {
        settle(reason)
        killTree(child, this.options.spawn ?? nodeSpawn)
      }
      const onAbort = (): void => stop('canceled')
      const timer = setTimeout(() => stop('timeout'), timeoutMs)
      signal?.addEventListener('abort', onAbort)
      const done = (code: number | null): void => settle(code)
      child.on('error', () => done(-1))
      child.on('close', done)
    })
  }

  /**
   * Připraví yt-dlp předem (při otevření stahování): stáhne ho, je-li potřeba, a jednou
   * naprázdno spustí. První spuštění nového programu je na pomalém počítači dlouhé.
   */
  warmUp(): Promise<void> {
    this.warm ??= (async () => {
      const exe = await this.prepareTool()
      await this.finished(this.spawnYtDlp(exe, ['--version']), WARM_UP_TIMEOUT_MS)
    })().catch(() => {
      // Nepovedlo se (třeba bez internetu) – zkusí se znovu příště nebo při náhledu.
      this.warm = null
    })
    return this.warm
  }

  /** Údaje o videu nebo playlistu bez stahování (název, kanál, délka, videa v playlistu). */
  async info(
    url: string,
    playlist: boolean,
    onStage?: (stage: KidsPreviewStage) => void,
    signal?: AbortSignal
  ): Promise<VideoInfo> {
    const { code, json, output } = await this.runInfo(url, playlist, onStage, signal)
    const info = code === 0 ? parseInfo(json) : null
    if (!info) throw new Error(errorMessage(output))
    return info
  }

  /**
   * Všechny údaje o jednom videu z YouTube (`yt-dlp -J`: štítky, popis, kategorie…), bez
   * stahování. Chyba spojení má `retry: true` (video samo je možná v pořádku).
   */
  async fullInfo(youtubeId: string): Promise<Record<string, unknown>> {
    let result: Awaited<ReturnType<KidsDownloader['runInfo']>>
    try {
      result = await this.runInfo(`https://www.youtube.com/watch?v=${youtubeId}`, false)
    } catch (error) {
      throw Object.assign(error as Error, { retry: true })
    }
    const { code, json, output } = result
    if (code === 0 && typeof json === 'object' && json !== null)
      return json as Record<string, unknown>
    const message = errorMessage(output)
    throw Object.assign(new Error(message), { retry: /připojení/.test(message) })
  }

  private async runInfo(
    url: string,
    playlist: boolean,
    onStage?: (stage: KidsPreviewStage) => void,
    signal?: AbortSignal
  ): Promise<{ code: number | null; json: unknown; output: string[] }> {
    onStage?.('tool')
    const exe = await this.prepareTool()
    if (signal?.aborted) throw new Error(PREVIEW_CANCELED)
    onStage?.('info')
    const child = this.spawnYtDlp(exe, buildInfoArgs(url, this.options.nodePath, playlist))
    const stdout: Buffer[] = []
    const output: string[] = []
    child.stdout!.on('data', (chunk: Buffer) => stdout.push(chunk))
    createInterface({ input: child.stderr! }).on('line', (line) => output.push(line))
    const code = await this.finished(child, INFO_TIMEOUT_MS, signal)
    if (code === 'canceled') throw new Error(PREVIEW_CANCELED)
    if (code === 'timeout')
      throw new Error('YouTube neodpověděl ani za 3 minuty. Zkus to prosím znovu.')
    let json: unknown = null
    try {
      json = JSON.parse(Buffer.concat(stdout).toString('utf8'))
    } catch {
      // Bez výstupu – chybu popíše výpis yt-dlp.
    }
    return { code, json, output }
  }

  /** Zruší právě běžící stahování (ve frontě). */
  cancel(): void {
    if (!this.child) return
    this.canceled = true
    killTree(this.child, this.options.spawn ?? nodeSpawn)
  }

  async download(
    url: string,
    options: { folder?: string; quality?: KidsQuality } = {}
  ): Promise<KidsDownloadResult> {
    if (this.running)
      return { ok: false, message: 'Už se stahuje jiné video – počkej, až doběhne.' }
    this.running = true
    this.canceled = false
    try {
      this.emit('progress', { phase: 'tool', percent: null, speed: null, eta: null })
      let exe: string
      try {
        exe = await this.prepareTool()
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
      const folder = options.folder ?? this.options.folder()
      await mkdir(folder, { recursive: true })
      await mkdir(this.options.tempDir, { recursive: true })
      const pathFile = join(this.options.tempDir, `yt-dlp-${Date.now()}.txt`)
      try {
        return await this.run(exe, url, folder, pathFile, options.quality)
      } finally {
        await rm(pathFile, { force: true })
      }
    } finally {
      this.running = false
      this.child = null
    }
  }

  private async run(
    exe: string,
    url: string,
    folder: string,
    pathFile: string,
    quality: KidsQuality | undefined
  ): Promise<KidsDownloadResult> {
    this.emit('progress', { phase: 'starting', percent: null, speed: null, eta: null })
    const args = buildDownloadArgs({
      url,
      folder,
      ffmpegDir: this.options.ffmpegDir,
      nodePath: this.options.nodePath,
      pathFile,
      quality
    })
    const child = this.spawnYtDlp(exe, args)
    this.child = child
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
    if (this.canceled) return { ok: false, message: 'Zrušeno.' }
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
    let info: InfoJson = {}
    try {
      info = JSON.parse(await readFile(`${base}.info.json`, 'utf8')) as InfoJson
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

/**
 * Ukončí proces i s podprocesy. yt-dlp.exe je na Windows spouštěč, který pouští vlastní
 * kopii Pythonu (a ta ffmpeg) – samotné `kill()` by zastavilo jen spouštěč a stahování
 * by běželo dál.
 */
export function killTree(
  child: ChildProcess,
  spawnImpl: typeof nodeSpawn,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform === 'win32' && child.pid) {
    spawnImpl('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on(
      'error',
      () => child.kill()
    )
  } else child.kill()
}
