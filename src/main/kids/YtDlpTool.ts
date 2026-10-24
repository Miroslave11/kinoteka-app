import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sha256For } from './ytdlp'

const REPO = 'yt-dlp/yt-dlp'
const EXE = 'yt-dlp.exe'
/** YouTube se často mění – novou verzi yt-dlp stačí hledat jednou denně. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
/** Dotaz na poslední verzi je malý; program má ~18 MB (na pomalé lince i minuty). */
const API_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

export interface YtDlpToolOptions {
  /** Složka, kam se yt-dlp stáhne (v datech aplikace). */
  dir: string
  fetch: typeof fetch
  now?: () => Date
}

/**
 * yt-dlp se nebalí do instalátoru (licence GPL, YouTube vyžaduje časté aktualizace):
 * stáhne se z oficiálních vydání na GitHubu, ověří podle SHA2-256SUMS a jednou denně
 * se zkontroluje novější verze.
 */
export class YtDlpTool {
  /** Právě běžící příprava – souběžná volání (příprava předem a náhled) ji sdílejí. */
  private pending: Promise<string> | null = null

  constructor(private readonly options: YtDlpToolOptions) {}

  get exePath(): string {
    return join(this.options.dir, EXE)
  }

  private get versionFile(): string {
    return join(this.options.dir, 'VERSION')
  }

  private get checkedFile(): string {
    return join(this.options.dir, 'CHECKED')
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  /** Verze staženého yt-dlp; null = zatím nestažený. */
  async version(): Promise<string | null> {
    if (!existsSync(this.exePath)) return null
    try {
      return (await readFile(this.versionFile, 'utf8')).trim() || null
    } catch {
      return null
    }
  }

  /**
   * Cesta k yt-dlp připravenému ke stažení videa: chybí-li, stáhne ho; jinak jednou
   * denně zkusí aktualizaci (bez internetu se použije stávající verze).
   */
  ensure(): Promise<string> {
    this.pending ??= this.prepare().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  private async prepare(): Promise<string> {
    const installed = await this.version()
    if (!installed) {
      await this.install(await this.latestTag())
      return this.exePath
    }
    if (await this.checkDue()) {
      try {
        const latest = await this.latestTag()
        if (latest !== installed) await this.install(latest)
        await writeFile(this.checkedFile, this.now().toISOString())
      } catch {
        // Aktualizace počká na příště – stávající verze obvykle stále funguje.
      }
    }
    return this.exePath
  }

  /** Tlačítko „Zkontrolovat aktualizace“: stáhne novější verzi hned. Vrací aktuální verzi. */
  async checkNow(): Promise<string> {
    const latest = await this.latestTag()
    if (latest !== (await this.version())) await this.install(latest)
    await writeFile(this.checkedFile, this.now().toISOString())
    return latest
  }

  private async checkDue(): Promise<boolean> {
    try {
      const checked = new Date((await readFile(this.checkedFile, 'utf8')).trim()).getTime()
      return !(this.now().getTime() - checked < CHECK_INTERVAL_MS)
    } catch {
      return true
    }
  }

  /** fetch s časovým limitem (jinak by zaseknuté spojení čekalo navždy). */
  private async get(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.options.fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      if ((error as Error).name === 'TimeoutError')
        throw new Error('GitHub neodpověděl včas – zkontroluj připojení k internetu.', {
          cause: error
        })
      throw error
    }
  }

  private async latestTag(): Promise<string> {
    const response = await this.get(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      API_TIMEOUT_MS,
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    if (!response.ok) throw new Error(`GitHub vrátil chybu HTTP ${response.status}`)
    const tag = ((await response.json()) as { tag_name?: unknown }).tag_name
    if (typeof tag !== 'string' || !/^[\w.-]+$/.test(tag)) throw new Error('Neznámá verze yt-dlp.')
    return tag
  }

  private async download(tag: string, name: string): Promise<Buffer> {
    const response = await this.get(
      `https://github.com/${REPO}/releases/download/${tag}/${name}`,
      DOWNLOAD_TIMEOUT_MS
    )
    if (!response.ok) throw new Error(`Stažení ${name} selhalo: HTTP ${response.status}`)
    try {
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if ((error as Error).name === 'TimeoutError')
        throw new Error(`Stažení ${name} trvalo příliš dlouho – zkus to znovu.`, { cause: error })
      throw error
    }
  }

  private async install(tag: string): Promise<void> {
    const sums = (await this.download(tag, 'SHA2-256SUMS')).toString('utf8')
    const expected = sha256For(sums, EXE)
    if (!expected) throw new Error('Vydání yt-dlp neobsahuje kontrolní součet pro yt-dlp.exe.')
    const data = await this.download(tag, EXE)
    const actual = createHash('sha256').update(data).digest('hex')
    if (actual !== expected) throw new Error('Stažený yt-dlp nesouhlasí s kontrolním součtem.')

    await mkdir(this.options.dir, { recursive: true })
    const part = `${this.exePath}.part`
    await writeFile(part, data)
    await rm(this.exePath, { force: true })
    await rename(part, this.exePath)
    await writeFile(this.versionFile, `${tag}\n`)
    await writeFile(this.checkedFile, this.now().toISOString())
  }
}
