import { EventEmitter } from 'node:events'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  youtubePlaylistUrl,
  youtubeThumbnailUrl,
  youtubeVideoUrl,
  type KidsDownloadProgress,
  type KidsDownloadRequest,
  type KidsPreviewResult,
  type KidsPreviewStage,
  type KidsQueueItem,
  MAX_PLAYLIST_VIDEOS,
  type YoutubeLink
} from '../../shared/kids'
import { deriveTitleName, matchTitle, safeFolderName } from './classify'
import { PREVIEW_CANCELED, type KidsDownloader } from './KidsDownloader'
import type { KidsRepository } from './KidsRepository'
import type { VideoInfo } from './ytdlp'

interface QueueEvents {
  changed: []
}

/** Co fronta potřebuje od `KidsDownloader` (v testech stačí napodobenina). */
export interface QueueDownloader {
  info: KidsDownloader['info']
  download: KidsDownloader['download']
  cancel: () => void
  on: (event: 'progress', listener: (progress: KidsDownloadProgress) => void) => unknown
  off: (event: 'progress', listener: (progress: KidsDownloadProgress) => void) => unknown
}

export interface KidsDownloadQueueDeps {
  downloader: QueueDownloader
  repository: Pick<KidsRepository, 'videoByYoutubeId' | 'titles'>
  /** Složka Kids. */
  folder: () => string
  /** Po každém staženém videu – zařazení do titulu v knihovně. */
  scan: () => Promise<unknown>
  /** Rychlé údaje o videu bez yt-dlp (oEmbed); null = načte je yt-dlp. */
  quickInfo?: (videoId: string) => Promise<VideoInfo | null>
}

type OnStage = (stage: KidsPreviewStage) => void

interface PreviewRun {
  onStage?: OnStage
  signal?: AbortSignal
}

/**
 * Fronta stahování v části Pro rodiče: náhled odkazu s návrhem titulu, rozbalení playlistu
 * na jednotlivá videa a jejich postupné stažení přímo do podsložky titulu.
 */
export class KidsDownloadQueue extends EventEmitter<QueueEvents> {
  private queue: KidsQueueItem[] = []
  private nextId = 1
  private pumping = false
  private current: KidsQueueItem | null = null
  /** Z náhledu: názvy videí a obsah playlistů (aby se nestahovaly znovu). */
  private readonly names = new Map<string, string>()
  private readonly playlists = new Map<string, VideoInfo>()
  private readonly qualities = new Map<number, KidsDownloadRequest['quality']>()
  /** Běžící náhled – nový ho zruší. */
  private previewRun: AbortController | null = null

  constructor(private readonly deps: KidsDownloadQueueDeps) {
    super()
  }

  get items(): KidsQueueItem[] {
    return this.queue.map((item) => ({ ...item }))
  }

  private async playlist(id: string, run: PreviewRun = {}): Promise<VideoInfo> {
    const cached = this.playlists.get(id)
    if (cached) return cached
    const url = youtubePlaylistUrl(id)
    const info = await this.deps.downloader.info(url, true, run.onStage, run.signal)
    this.playlists.set(id, info)
    return info
  }

  /** Video nejdřív rychle přes oEmbed, jinak přes yt-dlp (ten pozná i proč nejde stáhnout). */
  private async video(id: string, run: PreviewRun): Promise<VideoInfo> {
    if (this.deps.quickInfo) {
      run.onStage?.('quick')
      const quick = await this.deps.quickInfo(id)
      if (quick) return quick
    }
    return this.deps.downloader.info(youtubeVideoUrl(id), false, run.onStage, run.signal)
  }

  async preview(link: YoutubeLink, onStage?: OnStage): Promise<KidsPreviewResult> {
    // Nový náhled zruší předchozí – dva yt-dlp by na slabém počítači zabraly celý procesor.
    this.previewRun?.abort()
    const controller = new AbortController()
    this.previewRun = controller
    const run: PreviewRun = {
      // Zrušený náhled už nehlásí, co dělá (patřilo by to k novému).
      onStage: (stage) => {
        if (!controller.signal.aborted) onStage?.(stage)
      },
      signal: controller.signal
    }
    try {
      const [video, playlist] = await Promise.all([
        link.videoId ? this.video(link.videoId, run) : null,
        link.playlistId ? this.playlist(link.playlistId, run).catch(() => null) : null
      ])
      if (controller.signal.aborted) return { ok: false, message: PREVIEW_CANCELED }
      const main = video ?? playlist
      if (!main) return { ok: false, message: 'Playlist se nepodařilo načíst.' }
      const videoId = link.videoId ?? playlist?.entries[0]?.id ?? null
      if (video && link.videoId) this.names.set(link.videoId, video.title)
      for (const entry of playlist?.entries ?? []) this.names.set(entry.id, entry.title)

      const titles = this.deps.repository
        .titles()
        .map((t) => ({ name: t.folder, keywords: t.keywords }))
      const meta = {
        title: main.title,
        channel: main.channel,
        playlist: playlist?.title ?? null,
        series: null
      }
      const existing = matchTitle(meta, titles)
      const already = link.videoId ? this.deps.repository.videoByYoutubeId(link.videoId) : null
      return {
        ok: true,
        preview: {
          kind: video ? 'video' : 'playlist',
          videoId,
          title: main.title,
          channel: main.channel,
          durationSec: video?.durationSec ?? null,
          thumbnailUrl: videoId ? youtubeThumbnailUrl(videoId) : null,
          playlist:
            playlist && link.playlistId
              ? { id: link.playlistId, title: playlist.title, count: playlist.entries.length }
              : null,
          // Nový titul raději podle kanálu („Prasátko Peppa“) než podle názvu playlistu.
          suggestedTitle:
            existing ?? deriveTitleName({ ...meta, playlist: null }) ?? deriveTitleName(meta),
          suggestedExisting: existing !== null,
          alreadyIn: already ? (already.title ?? 'Ostatní') : null
        }
      }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    } finally {
      if (this.previewRun === controller) this.previewRun = null
    }
  }

  /** Přidá do fronty video, nebo všechna videa playlistu. Už stažená přeskočí. */
  async enqueue(
    request: KidsDownloadRequest
  ): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }> {
    const title = safeFolderName(request.title)
    let ids: string[]
    if (request.kind === 'playlist' && request.playlistId) {
      try {
        ids = (await this.playlist(request.playlistId)).entries
          .map((entry) => entry.id)
          .slice(0, MAX_PLAYLIST_VIDEOS)
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    } else if (request.videoId) ids = [request.videoId]
    else return { ok: false, message: 'Chybí video ke stažení.' }

    let added = 0
    for (const videoId of ids) {
      const queued = this.queue.some(
        (item) =>
          item.videoId === videoId && (item.status === 'waiting' || item.status === 'downloading')
      )
      if (queued || this.deps.repository.videoByYoutubeId(videoId)) continue
      const item: KidsQueueItem = {
        id: this.nextId++,
        videoId,
        name: this.names.get(videoId) ?? videoId,
        title,
        status: 'waiting',
        progress: null,
        message: null
      }
      this.qualities.set(item.id, request.quality)
      this.queue.push(item)
      added++
    }
    this.emit('changed')
    void this.pump()
    return { ok: true, added, skipped: ids.length - added }
  }

  /** Čekající video odebere, stahované zruší. */
  remove(id: number): void {
    const item = this.queue.find((entry) => entry.id === id)
    if (!item) return
    if (item.status === 'downloading') this.deps.downloader.cancel()
    else this.queue = this.queue.filter((entry) => entry.id !== id)
    this.emit('changed')
  }

  /** Stahuje se (nebo čeká) něco do této podsložky titulu? */
  isDownloadingInto(folder: string): boolean {
    return this.queue.some(
      (item) =>
        (item.status === 'waiting' || item.status === 'downloading') &&
        item.title.toLowerCase() === folder.toLowerCase()
    )
  }

  /** Odebere hotová, přeskočená a chybná videa ze seznamu. */
  clearFinished(): void {
    this.queue = this.queue.filter(
      (item) => item.status === 'waiting' || item.status === 'downloading'
    )
    this.emit('changed')
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    const onProgress = (progress: KidsDownloadProgress): void => {
      if (!this.current) return
      this.current.progress = progress
      this.emit('changed')
    }
    this.deps.downloader.on('progress', onProgress)
    try {
      let item: KidsQueueItem | undefined
      while ((item = this.queue.find((entry) => entry.status === 'waiting'))) {
        this.current = item
        item.status = 'downloading'
        this.emit('changed')
        const folder = join(this.deps.folder(), item.title)
        const result = await this.deps.downloader.download(youtubeVideoUrl(item.videoId), {
          folder,
          quality: this.qualities.get(item.id)
        })
        item.progress = null
        if (result.ok) {
          item.status = 'done'
          item.name = result.title
          item.message = null
          await this.deps.scan()
        } else if (result.message === 'Zrušeno.') {
          this.queue = this.queue.filter((entry) => entry !== item)
          await removePartialFiles(folder, item.videoId)
        } else {
          item.status = 'error'
          item.message = result.message
        }
        this.current = null
        this.emit('changed')
      }
    } finally {
      this.deps.downloader.off('progress', onProgress)
      this.pumping = false
    }
  }
}

/**
 * Po zrušení smaže rozpracované soubory videa (yt-dlp je pojmenuje s [ID] v názvu) a obrázek
 * s údaji, které yt-dlp uloží ještě před stažením videa.
 */
export async function removePartialFiles(folder: string, videoId: string): Promise<void> {
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return
  }
  const mine = names.filter((name) => name.includes(`[${videoId}]`))
  const partial = /\.(part|ytdl)$|\.(f\d+|temp)\.[^.]+$|\.part-Frag\d+/i
  const finished = mine.some((name) => /\.(mp4|mkv|webm)$/i.test(name) && !partial.test(name))
  const sidecar = /\.(info\.json|jpg|webp|png)$/i
  await Promise.all(
    mine
      .filter((name) => partial.test(name) || (!finished && sidecar.test(name)))
      .map((name) => rm(join(folder, name), { force: true }))
  )
}
