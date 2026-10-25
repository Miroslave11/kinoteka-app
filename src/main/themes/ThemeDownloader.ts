import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { constants, setPriority } from 'node:os'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import { killTree } from '../kids/KidsDownloader'
import { baseArgs, errorMessage } from '../kids/ytdlp'

/** Melodie stačí ze začátku videa (asi 1 MB); celé video by se stahovalo zbytečně. */
export const THEME_SECONDS = 90
/** Stažení minuty a půl zvuku trvá i na pomalém počítači nanejvýš pár desítek sekund. */
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000

export interface ThemeDownloaderOptions {
  /** Připraví yt-dlp (stáhne, aktualizuje) a vrátí cestu k němu. */
  tool: () => Promise<string>
  /** Složka s ffmpeg.exe (vystřižení začátku). */
  ffmpegDir: string
  /** Electron, který yt-dlp spustí jako Node (ELECTRON_RUN_AS_NODE). */
  nodePath: string
  spawn?: typeof nodeSpawn
}

export function buildThemeArgs(options: {
  url: string
  dir: string
  name: string
  ffmpegDir: string
  nodePath: string
  pathFile: string
}): string[] {
  return [
    ...baseArgs(options.nodePath),
    '--ffmpeg-location',
    options.ffmpegDir,
    '--no-playlist',
    // Jen zvuk, nejlépe AAC (m4a) – přehraje ho okno bez převodu.
    '-f',
    'ba[ext=m4a]/ba',
    '--download-sections',
    `*0-${THEME_SECONDS}`,
    '--no-mtime',
    '-P',
    options.dir,
    '-o',
    `${options.name}.%(ext)s`,
    '--print-to-file',
    'after_move:%(filepath)s',
    options.pathFile,
    options.url
  ]
}

/** Stahuje zvuk melodií z YouTube přes yt-dlp (sdílený s dětskou částí). */
export class ThemeDownloader {
  private readonly children = new Set<ChildProcess>()

  constructor(private readonly options: ThemeDownloaderOptions) {}

  /** Stáhne začátek zvuku z videa do `dir` jako `<name>.<přípona>`; vrací název souboru. */
  async download(url: string, dir: string, name: string): Promise<string> {
    let exe: string
    try {
      exe = await this.options.tool()
    } catch (error) {
      throw new Error(`Nástroj yt-dlp nejde stáhnout: ${(error as Error).message}`, {
        cause: error
      })
    }
    const pathFile = join(dir, `${name}.path.txt`)
    const spawnImpl = this.options.spawn ?? nodeSpawn
    const { ffmpegDir, nodePath } = this.options
    const child = spawnImpl(
      exe,
      buildThemeArgs({ url, dir, name, pathFile, ffmpegDir, nodePath }),
      {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' }
      }
    )
    this.children.add(child)
    // Na pozadí nesmí brzdit přehrávání ani práci s aplikací (podprocesy prioritu zdědí).
    try {
      if (child.pid) setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL)
    } catch {
      // Proces už skončil – nevadí.
    }
    const output: string[] = []
    createInterface({ input: child.stdout! }).on('line', (line) => output.push(line))
    createInterface({ input: child.stderr! }).on('line', (line) => output.push(line))
    try {
      const code = await new Promise<number | null | 'timeout'>((resolve) => {
        const timer = setTimeout(() => {
          resolve('timeout')
          killTree(child, spawnImpl)
        }, DOWNLOAD_TIMEOUT_MS)
        const done = (result: number | null): void => {
          clearTimeout(timer)
          resolve(result)
        }
        child.on('error', () => done(-1))
        child.on('close', done)
      })
      if (code === 'timeout') throw new Error('YouTube neodpověděl ani za 3 minuty. Zkus to znovu.')
      const file = await readFile(pathFile, 'utf8').then(
        (text) => text.split(/\r?\n/).filter(Boolean).at(-1) ?? '',
        () => ''
      )
      if (code !== 0 || !file) throw new Error(errorMessage(output))
      return basename(file)
    } finally {
      this.children.delete(child)
      await rm(pathFile, { force: true })
    }
  }

  /** Ukončí rozběhnutá stahování (při zavření aplikace). */
  stopAll(): void {
    for (const child of this.children) killTree(child, this.options.spawn ?? nodeSpawn)
    this.children.clear()
  }
}
