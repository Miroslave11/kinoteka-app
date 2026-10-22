import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { TMDB_IMAGE_URL } from './TmdbClient'

/** Povolené cesty: velikost + název souboru, nic jiného (ochrana proti „../“). */
const TMDB_PATH = /^\/(w\d{2,4}|original)\/[\w.-]+\.(jpg|jpeg|png|webp)$/

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

export interface CachedImage {
  data: Buffer
  contentType: string
}

/**
 * Obrázky z TMDB stažené při prvním zobrazení a uložené na disk.
 * Další zobrazení (i bez internetu) jdou z cache.
 */
export class ImageCache {
  private readonly downloads = new Map<string, Promise<void>>()

  constructor(
    private readonly directory: string,
    private readonly imageBaseUrl = TMDB_IMAGE_URL,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /** @param path např. „/w500/abc.jpg“ */
  async get(path: string): Promise<CachedImage | null> {
    if (!TMDB_PATH.test(path)) return null
    const file = join(this.directory, ...path.split('/').filter(Boolean))
    const exists = await stat(file).then(
      () => true,
      () => false
    )
    if (!exists) {
      // Souběžné požadavky na stejný obrázek sdílí jedno stažení.
      let download = this.downloads.get(path)
      if (!download) {
        download = this.download(path, file).finally(() => this.downloads.delete(path))
        this.downloads.set(path, download)
      }
      try {
        await download
      } catch {
        return null
      }
    }
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    return {
      data: await readFile(file),
      contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream'
    }
  }

  private async download(path: string, file: string): Promise<void> {
    const response = await this.fetchImpl(this.imageBaseUrl.replace(/\/$/, '') + path)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = Buffer.from(await response.arrayBuffer())
    await mkdir(dirname(file), { recursive: true })
    // Zápis přes dočasný soubor, aby nedokončené stažení nezůstalo jako „hotový“ obrázek.
    const temporary = `${file}.part`
    await writeFile(temporary, data)
    await rename(temporary, file)
  }
}
