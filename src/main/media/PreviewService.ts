import { EventEmitter } from 'node:events'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { paletteFromPixels, type Palette, type PreviewStatus } from '../../shared/posterPalette'
import type { CatalogRepository } from '../catalog/CatalogRepository'
import type { SettingsRepository } from '../settings/SettingsRepository'
import { chooseClipTimes } from './clipTimes'

const CLIPS_SETTING = 'previews.clips'

export interface PreviewTools {
  /** Obrázek plakátu podle cesty z kinoteka-media://tmdb/… (z cache, případně stažený). */
  poster(path: string): Promise<Buffer | null>
  pixels(image: Buffer): Promise<Uint8Array>
  clip(input: string, startSec: number, output: string, hdr: boolean): Promise<void>
}

interface PreviewServiceEvents {
  changed: []
}

/**
 * Barvy z plakátů a tiché klipy z filmů pro pozadí. Pracuje na pozadí po jednom
 * souboru se sníženou prioritou ffmpeg.
 */
export class PreviewService extends EventEmitter<PreviewServiceEvents> {
  private running: Promise<void> | null = null
  private again = false

  constructor(
    private readonly catalog: CatalogRepository,
    private readonly settings: SettingsRepository,
    private readonly tools: PreviewTools,
    private readonly clipsDir: string
  ) {
    super()
  }

  clipsEnabled(): boolean {
    return this.settings.get<boolean>(CLIPS_SETTING) ?? true
  }

  async setClipsEnabled(enabled: boolean): Promise<void> {
    this.settings.set(CLIPS_SETTING, enabled)
    if (!enabled) {
      // Vypnuté klipy nemají zabírat místo na disku.
      this.catalog.clearClips()
      await rm(this.clipsDir, { recursive: true, force: true })
    }
    this.emit('changed')
    void this.run()
  }

  status(): PreviewStatus {
    return {
      clipsEnabled: this.clipsEnabled(),
      pending: this.clipsEnabled() ? this.catalog.filesNeedingClips().length : 0,
      working: this.running !== null
    }
  }

  run(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.loop().finally(() => {
      this.running = null
      this.emit('changed')
    })
    return this.running
  }

  private async loop(): Promise<void> {
    await this.removeOrphanClips()
    do {
      this.again = false
      await this.palettes()
      if (this.clipsEnabled()) await this.clips()
    } while (this.again)
  }

  private async palettes(): Promise<void> {
    for (const { id, posterUrl } of this.catalog.titlesNeedingPalette()) {
      let palette: Palette | null
      try {
        const image = await this.tools.poster(new URL(posterUrl).pathname)
        if (!image) continue // plakát teď nejde stáhnout – zkusí se příště
        palette = paletteFromPixels(await this.tools.pixels(image))
      } catch {
        palette = null
      }
      this.catalog.savePalette(id, posterUrl, palette)
      this.emit('changed')
    }
  }

  private async clips(): Promise<void> {
    await mkdir(this.clipsDir, { recursive: true })
    for (const file of this.catalog.filesNeedingClips()) {
      if (!this.clipsEnabled()) return
      const times = chooseClipTimes(file.durationSec)
      if (times.length === 0) {
        this.catalog.saveClips(file.id, [], 'skipped')
        continue
      }
      const made: string[] = []
      try {
        for (const [index, start] of times.entries()) {
          const name = `${file.id}-${index}.mp4`
          await this.tools.clip(file.path, start, join(this.clipsDir, name), file.hdr)
          made.push(name)
        }
        this.catalog.saveClips(file.id, made, 'done')
      } catch {
        // I částečný výsledek se hodí; nepovedené soubory se nezkoušejí pořád dokola.
        this.catalog.saveClips(file.id, made, made.length > 0 ? 'done' : 'error')
      }
      this.emit('changed')
    }
  }

  /** Smaže soubory klipů, na které už nic neodkazuje (smazané nebo změněné filmy). */
  private async removeOrphanClips(): Promise<void> {
    const used = this.catalog.clipFiles()
    let names: string[]
    try {
      names = await readdir(this.clipsDir)
    } catch {
      return
    }
    await Promise.all(
      names
        .filter((name) => !used.has(name))
        .map((name) => rm(join(this.clipsDir, name), { force: true }))
    )
  }
}
