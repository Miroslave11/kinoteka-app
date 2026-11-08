import { EventEmitter } from 'node:events'
import type { Dirent } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  youtubePlaylistUrl,
  youtubeThumbnailUrl,
  youtubeVideoUrl,
  type KidsDownloadRequest,
  type KidsPreviewResult,
  type KidsPreviewStage,
  type KidsQuality,
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
}

/** Video fronty uložené na disk (přežije restart aplikace). */
export interface SavedQueueItem {
  videoId: string
  name: string
  title: string
  status: 'waiting' | 'downloading' | 'paused' | 'error'
  message: string | null
  quality: KidsQuality | undefined
}

/** Údaje z náhledu, podle kterých se navrhuje, kam video uložit. */
export interface SuggestMeta {
  title: string
  channel: string | null
  playlist: string | null
}

export interface KidsDownloadQueueDeps {
  downloader: QueueDownloader
  /** Dětská část: titul a „už staženo“ podle databáze titulů. */
  repository?: Pick<KidsRepository, 'videoByYoutubeId' | 'titles'>
  /** Jiná část (YT videa): vlastní návrh podsložky; null = bez návrhu. */
  suggest?: (meta: SuggestMeta) => { name: string | null; existing: boolean }
  /** Jiná část: podsložka, ve které už video je (null = není staženo). */
  alreadyIn?: (videoId: string) => string | null
  /** Kořenová složka (Kids, YT); položka s prázdným `title` se stáhne přímo do ní. */
  folder: () => string
  /** Po každém staženém videu – zařazení do titulu v knihovně. */
  scan: () => Promise<unknown>
  /** Rychlé údaje o videu bez yt-dlp (oEmbed); null = načte je yt-dlp. */
  quickInfo?: (videoId: string) => Promise<VideoInfo | null>
  /** Kolik videí stahovat najednou (1–3); bez = po jednom. */
  concurrency?: () => number
  /** Uložení fronty (YT videa) – po restartu se pokračuje, viz {@link KidsDownloadQueue.restore}. */
  store?: { load: () => SavedQueueItem[]; save: (items: SavedQueueItem[]) => void }
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
  /** Právě stahovaná videa (id položky → zrušení s důvodem 'cancel' / 'pause'). */
  private readonly running = new Map<number, AbortController>()
  /** Z náhledu: názvy videí a obsah playlistů (aby se nestahovaly znovu). */
  private readonly names = new Map<string, string>()
  private readonly playlists = new Map<string, VideoInfo>()
  private readonly qualities = new Map<number, KidsQuality | undefined>()
  /** Běžící náhled – nový ho zruší. */
  private previewRun: AbortController | null = null

  constructor(private readonly deps: KidsDownloadQueueDeps) {
    super()
  }

  /** Navržená podsložka pro video (titul podle jména a kanálu, nebo podle `deps.suggest`). */
  private suggest(meta: SuggestMeta): { name: string | null; existing: boolean } {
    if (this.deps.suggest) return this.deps.suggest(meta)
    const titles = (this.deps.repository?.titles() ?? []).map((t) => ({
      name: t.folder,
      keywords: t.keywords
    }))
    const full = { ...meta, series: null }
    const existing = matchTitle(full, titles)
    // Nový titul raději podle kanálu („Prasátko Peppa“) než podle názvu playlistu.
    return existing
      ? { name: existing, existing: true }
      : {
          name: deriveTitleName({ ...full, playlist: null }) ?? deriveTitleName(full),
          existing: false
        }
  }

  /** Podsložka, ve které už video je; null = ještě není staženo. */
  private alreadyIn(videoId: string): string | null {
    if (this.deps.alreadyIn) return this.deps.alreadyIn(videoId)
    const found = this.deps.repository?.videoByYoutubeId(videoId)
    return found ? (found.title ?? 'Ostatní') : null
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

      const suggestion = this.suggest({
        title: main.title,
        channel: main.channel,
        playlist: playlist?.title ?? null
      })
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
          suggestedTitle: suggestion.name,
          suggestedExisting: suggestion.existing,
          alreadyIn: link.videoId ? this.alreadyIn(link.videoId) : null
        }
      }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    } finally {
      if (this.previewRun === controller) this.previewRun = null
    }
  }

  /**
   * Videa požadavku s názvy z náhledu (YT videa přidávaná jako online): jedno video, nebo
   * videa playlistu (nejvýš {@link MAX_PLAYLIST_VIDEOS}).
   */
  async entries(
    request: KidsDownloadRequest
  ): Promise<
    { ok: true; entries: { youtubeId: string; title: string }[] } | { ok: false; message: string }
  > {
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
    else return { ok: false, message: 'Chybí video.' }
    return {
      ok: true,
      entries: ids.map((id) => ({ youtubeId: id, title: this.names.get(id) ?? id }))
    }
  }

  /** Přidá do fronty video, nebo všechna videa playlistu. Už stažená přeskočí. */
  async enqueue(
    request: KidsDownloadRequest
  ): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }> {
    // Prázdný název = přímo do kořenové složky (YT videa: zařadí se podle obsahu).
    const title = request.title ? safeFolderName(request.title) : ''
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

    // Video přidané bez náhledu (třeba „Stáhnout do počítače“ u online videa) – aspoň název.
    const [single] = ids
    if (ids.length === 1 && single && !this.names.has(single) && this.deps.quickInfo) {
      const quick = await this.deps.quickInfo(single).catch(() => null)
      if (quick) this.names.set(single, quick.title)
    }
    let added = 0
    for (const videoId of ids) {
      const queued = this.queue.some((item) => item.videoId === videoId && isPending(item))
      if (queued || this.alreadyIn(videoId) !== null) continue
      this.push({
        videoId,
        name: this.names.get(videoId) ?? videoId,
        title,
        status: 'waiting',
        message: null,
        quality: request.quality
      })
      added++
    }
    this.changed(true)
    this.pump()
    return { ok: true, added, skipped: ids.length - added }
  }

  private push(saved: SavedQueueItem): void {
    const item: KidsQueueItem = {
      id: this.nextId++,
      videoId: saved.videoId,
      name: saved.name,
      title: saved.title,
      status: saved.status,
      progress: null,
      message: saved.message
    }
    this.qualities.set(item.id, saved.quality)
    this.queue.push(item)
  }

  /**
   * Fronta z minulého spuštění (YT videa): nedokončená videa se stahují dál – yt-dlp
   * naváže na rozpracované soubory. Pozastavená zůstanou pozastavená, chybná chybná.
   */
  restore(): void {
    for (const saved of this.deps.store?.load() ?? []) {
      if (this.queue.some((item) => item.videoId === saved.videoId)) continue
      this.push({ ...saved, status: saved.status === 'downloading' ? 'waiting' : saved.status })
    }
    this.changed(false)
    this.pump()
  }

  /** Čekající nebo pozastavené video odebere, stahované zruší (rozpracované soubory smaže). */
  remove(id: number): void {
    const item = this.queue.find((entry) => entry.id === id)
    if (!item) return
    const running = this.running.get(id)
    if (running) return running.abort('cancel')
    this.queue = this.queue.filter((entry) => entry.id !== id)
    if (item.status === 'paused') void removePartialFiles(this.folderOf(item), item.videoId)
    this.changed(true)
  }

  /** Zruší všechna čekající, pozastavená i stahovaná videa. */
  cancelAll(): void {
    for (const item of this.queue.filter(isPending)) this.remove(item.id)
  }

  /** Pozastaví všechno nedokončené; rozpracované soubory zůstanou pro pokračování. */
  pause(): void {
    for (const item of this.queue) if (item.status === 'waiting') item.status = 'paused'
    for (const controller of this.running.values()) controller.abort('pause')
    this.changed(true)
  }

  /** Pozastavená videa zase stahuje. */
  resume(): void {
    for (const item of this.queue) if (item.status === 'paused') item.status = 'waiting'
    this.changed(true)
    this.pump()
  }

  /** Změnil se počet souběžných stahování – rozjede další čekající videa. */
  refresh(): void {
    this.pump()
  }

  /** Chybné video (nebo všechna chybná, bez `id`) zkusí stáhnout znovu. */
  retry(id?: number): void {
    for (const item of this.queue)
      if (item.status === 'error' && (id === undefined || item.id === id)) {
        item.status = 'waiting'
        item.message = null
      }
    this.changed(true)
    this.pump()
  }

  /** Stahuje se (nebo čeká) něco do této podsložky titulu? */
  isDownloadingInto(folder: string): boolean {
    return this.queue.some(
      (item) => isPending(item) && item.title.toLowerCase() === folder.toLowerCase()
    )
  }

  /** Odebere hotová, přeskočená a chybná videa ze seznamu. */
  clearFinished(): void {
    this.queue = this.queue.filter(isPending)
    this.changed(true)
  }

  private folderOf(item: KidsQueueItem): string {
    return item.title ? join(this.deps.folder(), item.title) : this.deps.folder()
  }

  /** Oznámí změnu; `save` = změnil se seznam nebo stav (ne jen průběh) → uložit frontu. */
  private changed(save: boolean): void {
    if (save && this.deps.store)
      this.deps.store.save(
        this.queue
          .filter((item) => isPending(item) || item.status === 'error')
          .map((item) => ({
            videoId: item.videoId,
            name: item.name,
            title: item.title,
            status: item.status as SavedQueueItem['status'],
            message: item.message,
            quality: this.qualities.get(item.id)
          }))
      )
    this.emit('changed')
  }

  /** Spustí čekající videa, dokud běží méně stahování, než dovoluje nastavení. */
  private pump(): void {
    const limit = Math.max(1, Math.min(3, this.deps.concurrency?.() ?? 1))
    let item: KidsQueueItem | undefined
    while (
      this.running.size < limit &&
      (item = this.queue.find((entry) => entry.status === 'waiting'))
    )
      void this.start(item)
  }

  private async start(item: KidsQueueItem): Promise<void> {
    const controller = new AbortController()
    this.running.set(item.id, controller)
    item.status = 'downloading'
    item.message = null
    this.changed(true)
    const folder = this.folderOf(item)
    const result = await this.deps.downloader.download(youtubeVideoUrl(item.videoId), {
      folder,
      quality: this.qualities.get(item.id),
      onProgress: (progress) => {
        item.progress = progress
        this.emit('changed')
      },
      signal: controller.signal
    })
    this.running.delete(item.id)
    item.progress = null
    if (result.ok) {
      item.status = 'done'
      item.name = result.title
      item.message = null
      this.changed(true)
      await this.deps.scan()
    } else if (controller.signal.aborted && controller.signal.reason === 'pause') {
      item.status = 'paused'
      this.changed(true)
    } else if (controller.signal.aborted) {
      this.queue = this.queue.filter((entry) => entry !== item)
      this.changed(true)
      await removePartialFiles(folder, item.videoId)
    } else {
      item.status = 'error'
      item.message = result.message
      this.changed(true)
    }
    this.pump()
  }
}

/** Ještě nedokončené video (čeká, stahuje se, nebo je pozastavené). */
const isPending = (item: KidsQueueItem): boolean =>
  item.status === 'waiting' || item.status === 'downloading' || item.status === 'paused'

/**
 * Rozpracované soubory (.part a podobně), ke kterým už ve frontě nic není – zůstanou po
 * pádu nebo starší verzi aplikace a zabírají místo. Hledá ve složce a jejích podsložkách.
 */
export async function removeOrphanPartials(root: string, keep: Set<string>): Promise<number> {
  let removed = 0
  const visit = async (folder: string, depth: number): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(folder, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (depth === 0) await visit(join(folder, entry.name), 1)
        continue
      }
      const id = /\[([\w-]{11})\]/.exec(entry.name)?.[1]
      if (!id || keep.has(id) || !PARTIAL.test(entry.name)) continue
      await rm(join(folder, entry.name), { force: true })
      removed++
    }
  }
  await visit(root, 0)
  return removed
}

const PARTIAL = /\.(part|ytdl)$|\.(f\d+|temp)\.[^.]+$|\.part-Frag\d+/i

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
  const partial = PARTIAL
  const finished = mine.some((name) => /\.(mp4|mkv|webm)$/i.test(name) && !partial.test(name))
  const sidecar = /\.(info\.json|jpg|webp|png)$/i
  await Promise.all(
    mine
      .filter((name) => partial.test(name) || (!finished && sidecar.test(name)))
      .map((name) => rm(join(folder, name), { force: true }))
  )
}
