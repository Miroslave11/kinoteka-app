import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { WindowState } from '../shared/api'
import { IpcChannel } from '../shared/ipc'
import {
  DEFAULT_KIDS_SETTINGS,
  parseKidsSettings,
  type KidsQuality,
  type KidsSettings
} from '../shared/kids'
import { VIDEO_EXTENSIONS } from '../shared/library'
import { parseClassification } from '../shared/classification'
import { parseFileIds } from '../shared/deletion'
import { canResume, parsePlayRequest } from '../shared/playback'
import { parsePlayerCommand, type OpenFileResult } from '../shared/player'
import { subtitleStyleArgs, SUBTITLES_OFF } from '../shared/subtitles'
import {
  audioLaunchOptions,
  listAudioDevices,
  loadAudioSettings,
  saveAudioSettings
} from './audio/audioSettings'
import { registerAppInfoIpc } from './appInfo'
import { broadcast } from './broadcast'
import { CatalogRepository } from './catalog/CatalogRepository'
import { registerImdbIpc } from './imdb/imdbIpc'
import { DeletionService } from './deletion/DeletionService'
import { registerJournalIpc } from './journal/journalIpc'
import { DRIVE_ENDPOINTS, driveEndpointsAt } from './sync/driveClient'
import { endpointsAt, GOOGLE_ENDPOINTS } from './sync/googleAuth'
import { JournalSync } from './sync/journalSync'
import { registerSyncIpc } from './sync/syncIpc'
import { SyncService } from './sync/SyncService'
import { registerHaIpc } from './ha/haIpc'
import { HaService } from './ha/HaService'
import { HaAutomation, type HaPlaybackRun } from './ha/HaAutomation'
import type { HaStatus } from '../shared/ha'
import type { SyncAdapter } from './sync/syncModel'
import { ytCategoryAdapter, ytVideoAdapter } from './sync/ytSync'
import { JournalRepository } from './journal/JournalRepository'
import { ImdbService } from './imdb/ImdbService'
import { KidsArtwork } from './kids/KidsArtwork'
import { KidsDownloader } from './kids/KidsDownloader'
import {
  KidsDownloadQueue,
  removeOrphanPartials,
  type SavedQueueItem
} from './kids/KidsDownloadQueue'
import { kidsFolder, KIDS_SETTINGS_KEY, registerKidsIpc } from './kids/kidsIpc'
import { KidsGuard } from './kids/KidsGuard'
import { KidsTracker, kidsPlayItem, PlayTimeMeter, type KidsPlayItem } from './kids/kidsPlayback'
import { KidsLibrary } from './kids/KidsLibrary'
import { KidsRepository } from './kids/KidsRepository'
import { fetchOembed } from './kids/oembed'
import { YtDlpTool } from './kids/YtDlpTool'
import { YtLibrary } from './yt/YtLibrary'
import { ytPlayItem, type YtPlayItem } from './yt/ytPlayback'
import {
  isPlayable,
  mpvFileFor,
  mpvNetworkArgs,
  waitUntilPlayable,
  YtStreamResolver,
  type SavedStream
} from './yt/ytStream'
import { matchCategory, metaFromInfo } from './yt/ytClassify'
import { QUEUE_SETTING, registerYtIpc, ytConcurrency, ytFolder } from './yt/ytIpc'
import { YtRepository } from './yt/YtRepository'
import { openDatabase } from './db/database'
import { makeClip, posterPixels, videoThumbnail } from './media/ffmpeg'
import { runFfprobe } from './media/ffprobe'
import { PreviewService } from './media/PreviewService'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'
import { ImageCache } from './metadata/ImageCache'
import { registerMetadataIpc } from './metadata/metadataIpc'
import { MetadataService } from './metadata/MetadataService'
import { TMDB_IMAGE_URL, TmdbClient } from './metadata/TmdbClient'
import { ProbeService } from './media/ProbeService'
import { binaryPath, ffprobeExecutablePath, mpvExecutablePath } from './mpv/binary'
import { AutoScan } from './library/AutoScan'
import { registerLibraryIpc } from './library/libraryIpc'
import { LibraryRepository } from './library/LibraryRepository'
import { LibraryService } from './library/LibraryService'
import { PlaybackRepository, type PlaybackItem } from './playback/PlaybackRepository'
import { PlaybackTracker } from './playback/PlaybackTracker'
import { PlayerSession } from './player/PlayerSession'
import type { TrackChoices } from './player/TrackSelector'
import {
  findDownloadedSubtitles,
  findExternalSubtitles,
  prepareSubtitle
} from './subtitles/externalSubtitles'
import { OnlineSubtitlesService } from './subtitles/OnlineSubtitlesService'
import { loadSubtitleSettings, saveSubtitleSettings } from './subtitles/subtitleSettings'
import { registerUpdateIpc } from './update/updateIpc'
import { ThemeDownloader } from './themes/ThemeDownloader'
import { AutoThemes } from './themes/AutoThemes'
import { themerrYoutubeUrl } from './themes/themerr'
import { loadThemeSettings, registerThemesIpc } from './themes/themesIpc'
import { ThemeService } from './themes/ThemeService'
import { hardenWebContents, loadRendererPage, preloadPath } from './rendererPage'
import { SettingsRepository } from './settings/SettingsRepository'
import { WindowMode } from './windowMode'
import { createMainWindowOptions } from './windowOptions'

// S DirectComposition kreslí Chromium obsah oken nad všechna vnořená nativní okna,
// takže by zakryl obraz, který mpv kreslí do okna aplikace (--wid).
app.commandLine.appendSwitch('disable-direct-composition')
// Data (knihovna, deník, nastavení) ve stejné složce ve vývoji i v nainstalované aplikaci –
// jinak by se podle názvu produktu („Kinotéka“) po instalaci začínalo s prázdnou knihovnou.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'kinoteka'))
}
registerMediaScheme()

// Jen jedna Kinotéka naráz: dvě instance nad stejnou databází a mezipamětí by si zapisovaly
// pod rukama (Chromium pak hlásí „Unable to move the cache“). Další spuštění jen přepne
// do už otevřeného okna.
const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) app.quit()
let mainWindow: BrowserWindow | null = null
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

let session: PlayerSession | null = null
let playback: PlaybackRepository
let tracker: PlaybackTracker
let settings: SettingsRepository
let windowMode: WindowMode

/** fetch přes síť Chromia (net.fetch), který neumí objekt URL – převede ho na text. */
const chromiumFetch: typeof fetch = (input, init) =>
  net.fetch(input instanceof URL ? input.toString() : input, init)

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(
    createMainWindowOptions(preloadPath(), windowMode.startFullscreen())
  )
  mainWindow = win
  win.once('ready-to-show', () => win.show())
  windowMode.attach(win, (state) => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannel.WindowChanged, state)
  })
  // F11 přepíná celou obrazovku; preventDefault zastaví i stejnou zkratku výchozí nabídky,
  // která by režim hned přepnula zpátky.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F11') return
    if (input.alt || input.control || input.shift || input.meta) return
    event.preventDefault()
    if (!input.isAutoRepeat) windowMode.toggle(win)
  })
  hardenWebContents(win)
  void loadRendererPage(win, 'index')
  return win
}

/** Uložená pozice, od které má pokračovat přehrávání; undefined = od začátku. */
function resumePosition(item: PlaybackItem): number | undefined {
  const progress = playback.progress(item.titleId, item.episodeId)
  return canResume(progress) ? progress.position : undefined
}

const nextLabel = (item: PlaybackItem): string | null =>
  playback.nextEpisode(item)?.shortLabel ?? null
const previousLabel = (item: PlaybackItem): string | null =>
  playback.previousEpisode(item)?.shortLabel ?? null

/** Titulky v jiném kódování než UTF-8 se převádějí do kopie v cache. */
const subtitleCacheDir = (): string => join(app.getPath('userData'), 'cache', 'subtitles')
/** Stažené titulky, které nešlo uložit vedle filmu (síťová složka jen pro čtení). */
const downloadedSubtitlesDir = (): string => join(app.getPath('userData'), 'subtitles')

/**
 * Výběr stop pro soubor: zapamatovaná volba pro film nebo seriál, jinak preferované jazyky;
 * k tomu externí titulky vedle souboru a uložený posun titulků.
 */
function trackChoicesFor(file: string, item?: PlaybackItem): TrackChoices {
  const subtitleSettings = loadSubtitleSettings(settings)
  return {
    audio: {
      remembered: item ? playback.trackPreference(item.titleId, 'audio') : null,
      languages: loadAudioSettings(settings).languages
    },
    subtitles: {
      remembered: item ? playback.trackPreference(item.titleId, 'sub') : null,
      mode: subtitleSettings.mode,
      languages: subtitleSettings.languages
    },
    subDelay: item ? playback.subDelay(item.fileId) : 0,
    externalSubtitles: async () =>
      Promise.all(
        [
          ...(await findExternalSubtitles(file)),
          ...(await findDownloadedSubtitles(downloadedSubtitlesDir(), file))
        ].map((found) => prepareSubtitle(found, file, subtitleCacheDir()))
      )
  }
}

/**
 * Spustí přehrávání. Soubor z knihovny (`item`) si pamatuje pozici a zhlédnutí;
 * soubor z dialogu „Otevřít soubor…“ (test přehrávače) ne.
 */
async function startPlayback(
  host: BrowserWindow,
  file: string,
  item?: PlaybackItem,
  startSec?: number
): Promise<void> {
  session?.close()
  // mpv hlásí pozici už během spouštění – do přiřazení se jeho události ignorují.
  let started: PlayerSession | undefined = undefined
  let haRun: HaPlaybackRun | null = null
  started = await PlayerSession.start({
    mainWindow: host,
    file,
    onPlaybackFlags: (flags) => haRun?.flags(flags),
    title: item?.label,
    startSec,
    next: item ? nextLabel(item) : null,
    previous: item ? previousLabel(item) : null,
    audio: audioLaunchOptions(loadAudioSettings(settings)),
    tracks: trackChoicesFor(file, item),
    subtitleArgs: subtitleStyleArgs(loadSubtitleSettings(settings).style),
    prepareSubtitle: (path) =>
      prepareSubtitle(path, tracker.current?.path ?? file, subtitleCacheDir()),
    logFile: join(app.getPath('logs'), 'mpv.log'),
    onProgress: (position, duration) => {
      if (session === started) tracker.update(position, duration)
    },
    onNext: () => {
      if (session === started) playSibling(started, 'next')
    },
    onPrevious: () => {
      if (session === started) playSibling(started, 'previous')
    },
    onStop: () => {
      if (session === started) tracker.discard()
    },
    onAudioTrackChosen: (track) => {
      const current = tracker.current
      if (session !== started || !current) return
      playback.saveTrackPreference(current.titleId, 'audio', {
        language: track.language,
        title: track.title
      })
    },
    onSubtitleChosen: (track) => {
      const current = tracker.current
      if (session !== started || !current) return
      playback.saveTrackPreference(
        current.titleId,
        'sub',
        track
          ? { language: track.language, title: track.title }
          : { language: SUBTITLES_OFF, title: null }
      )
    },
    onSubDelayChanged: (seconds) => {
      const current = tracker.current
      if (session === started && current) playback.saveSubDelay(current.fileId, seconds)
    },
    onEnd: (info) => {
      haRun?.end()
      if (session === started) {
        session = null
        tracker.finish()
      }
      if (!host.isDestroyed()) host.webContents.send(IpcChannel.PlayerClosed, info)
    }
  })
  session = started
  if (item) tracker.start(item)
  else tracker.finish()
  // Home Assistant jen u filmů a seriálů z knihovny (ne u „Otevřít soubor…“).
  if (item)
    haRun =
      haAutomation?.begin(item.episodeId !== null ? 'series' : 'movie', (message) =>
        started?.notify(message)
      ) ?? null
}

/** „Další / předchozí díl“ – načte se do běžícího přehrávače, okno se nezavře. */
function playSibling(current: PlayerSession, direction: 'next' | 'previous'): void {
  const item = tracker.current
  if (!item) return
  const target = direction === 'next' ? playback.nextEpisode(item) : playback.previousEpisode(item)
  if (!target) return
  tracker.start(target)
  current.load({
    file: target.path,
    title: target.label,
    startSec: resumePosition(target),
    next: nextLabel(target),
    previous: previousLabel(target),
    tracks: trackChoicesFor(target.path, target)
  })
}

async function play(
  host: BrowserWindow | null,
  file: string,
  item?: PlaybackItem,
  startSec?: number
): Promise<OpenFileResult> {
  if (!host) return { ok: false, reason: 'error', message: 'Okno aplikace nebylo nalezeno.' }
  try {
    await startPlayback(host, file, item, startSec)
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'error', message: (error as Error).message }
  }
}

/** Právě hraná pohádka z dětské části (sousedé v titulu pro „předchozí / další“). */
let kidsCurrent: KidsPlayItem | null = null
let kidsMeter: PlayTimeMeter | null = null
let kidsTracker: KidsTracker
let kidsRepository: KidsRepository
let kidsGuard: KidsGuard

const kidsSettings = (): KidsSettings =>
  parseKidsSettings(settings.get(KIDS_SETTINGS_KEY) ?? DEFAULT_KIDS_SETTINGS)

const kidsPlayOptions = (): { autoplayNext: boolean; timeLeftSec: number | null } => {
  const { autoplayNext, timeLimitMin } = kidsSettings()
  return { autoplayNext, timeLeftSec: kidsGuard.timeLeft(timeLimitMin) }
}

/**
 * Pohádka z dětské části: přehrávač s dětským ovládáním, pozice se ukládá do dětské
 * historie (ne do deníku), rozkoukaná pohádka pokračuje bez ptaní. Hlídá denní limit.
 */
async function playKids(host: BrowserWindow | null, videoId: number): Promise<OpenFileResult> {
  const item = kidsPlayItem(kidsRepository, videoId, kidsPlayOptions())
  if (!item) return { ok: false, reason: 'error', message: 'Pohádka už ve složce není.' }
  if (!host) return { ok: false, reason: 'error', message: 'Okno aplikace nebylo nalezeno.' }
  if (item.info.limitReached) {
    return { ok: false, reason: 'error', message: 'Pohádky pro dnešek skončily.' }
  }
  try {
    session?.close()
    let started: PlayerSession | undefined = undefined
    // Denní limit: čas sledování se přičítá po kouscích; když dojde, pohádka se zastaví.
    const meter = new PlayTimeMeter((seconds) => {
      kidsGuard.addPlayTime(seconds)
      const left = kidsGuard.timeLeft(kidsSettings().timeLimitMin)
      if (!started || session !== started || left === null) return
      started.updateKids({ timeLeftSec: left, limitReached: left === 0 })
      if (left === 0) started.handle({ type: 'set-pause', paused: true })
    })
    kidsMeter = meter
    started = await PlayerSession.start({
      mainWindow: host,
      file: item.path,
      title: item.title,
      startSec: item.startSec,
      next: null,
      kids: item.info,
      audio: audioLaunchOptions(loadAudioSettings(settings)),
      tracks: trackChoicesFor(item.path),
      subtitleArgs: subtitleStyleArgs(loadSubtitleSettings(settings).style),
      logFile: join(app.getPath('logs'), 'mpv.log'),
      onProgress: (position, duration) => {
        if (session !== started) return
        kidsTracker.update(position, duration)
        meter.update(position)
      },
      onNext: () => {
        if (session === started && kidsCurrent?.nextId) loadKids(started, kidsCurrent.nextId)
      },
      onPrevious: () => {
        if (session === started && kidsCurrent?.previousId)
          loadKids(started, kidsCurrent.previousId)
      },
      onToggleFavorite: () => {
        if (session !== started || !kidsCurrent) return
        const favorite = !kidsRepository.isFavorite('video', kidsCurrent.videoId)
        kidsRepository.setFavorite('video', kidsCurrent.videoId, favorite)
        started.updateKids({ favorite })
        broadcast(IpcChannel.KidsChanged)
      },
      onEnd: (info) => {
        if (session === started) {
          session = null
          kidsCurrent = null
          kidsTracker.finish()
        }
        meter.stop()
        broadcast(IpcChannel.KidsChanged)
        if (!host.isDestroyed()) host.webContents.send(IpcChannel.PlayerClosed, info)
      }
    })
    session = started
    tracker.finish()
    kidsTracker.start(item.videoId)
    kidsCurrent = item
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'error', message: (error as Error).message }
  }
}

/** Další nebo předchozí pohádka titulu – načte se do běžícího přehrávače. */
function loadKids(current: PlayerSession, videoId: number): void {
  const item = kidsPlayItem(kidsRepository, videoId, kidsPlayOptions())
  if (!item || item.info.limitReached) return
  kidsTracker.start(item.videoId)
  kidsMeter?.restart()
  kidsCurrent = item
  current.load({
    file: item.path,
    title: item.title,
    startSec: item.startSec,
    next: null,
    tracks: trackChoicesFor(item.path),
    kids: item.info
  })
}

/** Právě hrané YT video (sousedé v kategorii pro „předchozí / další“). */
let ytCurrent: YtPlayItem | null = null
let ytTracker: KidsTracker
let ytRepository: YtRepository
let ytDownloaderRef: KidsDownloader | null = null
let ytQueueRef: KidsDownloadQueue | null = null
let syncRef: SyncService | null = null
let haRef: HaService | null = null
let haAutomation: HaAutomation | null = null
/** Klíč aplikace u Googlu (sdílení přes Google Disk) – vkládá ho workflow Vydání. */
const GOOGLE_CLIENT_ID = __KINOTEKA_GOOGLE_CLIENT_ID__
const GOOGLE_CLIENT_SECRET = __KINOTEKA_GOOGLE_CLIENT_SECRET__

/**
 * Video z části YT videa: běžný přehrávač s plným ovládáním, pozice se ukládá do vlastní
 * historie (ne do deníku), rozkoukané video pokračuje bez ptaní; předchozí / další v kategorii.
 */
async function playYt(host: BrowserWindow | null, videoId: number): Promise<OpenFileResult> {
  const item = ytPlayItem(ytRepository, videoId)
  if (!item) return { ok: false, reason: 'error', message: 'Video už ve složce není.' }
  if (!host) return { ok: false, reason: 'error', message: 'Okno aplikace nebylo nalezeno.' }
  let source: YtSource
  try {
    source = await ytSource(item)
  } catch (error) {
    // Video, které YouTube už nevydá (ne výpadek sítě), dostane štítek Nedostupné.
    if (item.online && !(error as { retry?: boolean }).retry) {
      ytRepository.setUnavailable(item.videoId, true)
      broadcast(IpcChannel.YtChanged)
    }
    return { ok: false, reason: 'error', message: ytStreamError(error) }
  }
  if (item.online) ytRepository.setUnavailable(item.videoId, false)
  try {
    session?.close()
    let started: PlayerSession | undefined = undefined
    let ytHaRun: HaPlaybackRun | null = null
    started = await PlayerSession.start({
      mainWindow: host,
      file: source.file,
      title: item.title,
      startSec: item.startSec,
      next: item.next?.name ?? null,
      previous: item.previous?.name ?? null,
      // Vždy s volbami pro síť – v jedné kategorii se můžou střídat stažená a online videa.
      networkArgs: mpvNetworkArgs({ headers: source.headers ?? {} }),
      onPlaybackFlags: (flags) => ytHaRun?.flags(flags),
      loadingText: ytLoadingText(item),
      audio: audioLaunchOptions(loadAudioSettings(settings)),
      tracks: trackChoicesFor(item.online ? '' : item.path),
      subtitleArgs: subtitleStyleArgs(loadSubtitleSettings(settings).style),
      prepareSubtitle: (path) => prepareSubtitle(path, item.path, subtitleCacheDir()),
      logFile: join(app.getPath('logs'), 'mpv.log'),
      onProgress: (position, duration) => {
        if (session === started) ytTracker.update(position, duration)
      },
      onNext: () => {
        if (session === started && ytCurrent?.next) void loadYt(started, ytCurrent.next.id)
      },
      onPrevious: () => {
        if (session === started && ytCurrent?.previous) void loadYt(started, ytCurrent.previous.id)
      },
      onStop: () => {
        if (session !== started) return
        const id = ytTracker.abandon()
        if (id !== null) ytRepository.clearProgress(id)
      },
      // Online video, které mpv neotevřelo (adresa mezitím přestala platit, výpadek sítě).
      onOpenFailed: () => {
        if (session !== started || !ytCurrent?.online) return false
        ytStreams?.forget(ytCurrent.online)
        return 'Video z YouTube se nepodařilo otevřít. Zkontroluj připojení a zkus ho pustit znovu.'
      },
      onEnd: (info) => {
        ytHaRun?.end()
        if (session === started) {
          session = null
          ytCurrent = null
          ytTracker.finish()
        }
        broadcast(IpcChannel.YtChanged)
        if (!host.isDestroyed()) host.webContents.send(IpcChannel.PlayerClosed, info)
      }
    })
    session = started
    tracker.finish()
    ytTracker.start(item.videoId)
    ytCurrent = item
    ytHaRun = haAutomation?.begin('yt', (message) => started?.notify(message)) ?? null
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'error', message: (error as Error).message }
  }
}

let ytStreams: YtStreamResolver | null = null

/** Náhled videa z YouTube v co nejlepší velikosti pro kartu (1280×720, jinak 320×180). */
async function youtubeThumbnail(
  fetchImpl: typeof fetch,
  youtubeId: string
): Promise<Uint8Array | null> {
  for (const name of ['hq720.jpg', 'mqdefault.jpg']) {
    try {
      const response = await fetchImpl(`https://i.ytimg.com/vi/${youtubeId}/${name}`)
      if (response.ok) return new Uint8Array(await response.arrayBuffer())
    } catch {
      // Bez připojení – karta použije náhled přes aplikaci, až bude síť.
    }
  }
  return null
}
let ytStreamStop: (() => void) | null = null
const ytQualitySetting = (): KidsQuality => {
  const saved = settings.get<string>('yt.quality')
  return saved === '2160' || saved === '720' ? saved : '1080'
}

/** Co přehrát: stažený soubor, nebo adresy z YouTube (online video) s hlavičkami. */
interface YtSource {
  file: string
  headers?: Record<string, string>
}

async function ytSource(item: YtPlayItem): Promise<YtSource> {
  if (!item.online) return { file: item.path }
  if (!ytStreams) throw new Error('Přehrávání online není připravené.')
  const stream = await ytStreams.resolve(item.online, ytQualitySetting())
  return { file: mpvFileFor(stream), headers: stream.headers }
}

/** Chyba při zjišťování adres online videa jako srozumitelná zpráva. */
function ytStreamError(error: unknown): string {
  const { message, retry } = error as Error & { retry?: boolean }
  return retry
    ? 'Online video teď nejde přehrát – zkontroluj připojení k internetu.'
    : message || 'Online video nejde přehrát.'
}

/** Další nebo předchozí video kategorie – načte se do běžícího přehrávače. */
async function loadYt(current: PlayerSession, videoId: number): Promise<void> {
  const item = ytPlayItem(ytRepository, videoId)
  if (!item) return
  // Zjištění adresy online videa trvá i několik sekund – přehrávač mezitím ukáže, co dělá.
  current.setLoading(ytLoadingText(item))
  let source: YtSource
  try {
    source = await ytSource(item)
  } catch (error) {
    current.notify(ytStreamError(error))
    return
  }
  if (session !== current) return
  ytTracker.start(item.videoId)
  ytCurrent = item
  current.load({
    file: source.file,
    title: item.title,
    startSec: item.startSec,
    next: item.next?.name ?? null,
    previous: item.previous?.name ?? null,
    httpHeaders: source.headers ?? {},
    tracks: trackChoicesFor(item.online ? '' : item.path),
    loadingText: ytLoadingText(item)
  })
}

/** Text při čekání na video z části YT videa. */
const ytLoadingText = (item: YtPlayItem): string =>
  item.online ? 'Načítám video z YouTube…' : 'Načítám video…'

/** Titulky z OpenSubtitles: nastavení z hlavního okna, hledání a stažení jen z ovládání přehrávače. */
function registerOnlineSubtitlesIpc(service: OnlineSubtitlesService): void {
  const fromPlayer = (sender: Electron.WebContents): PlayerSession | null =>
    session && sender === session.overlay.webContents ? session : null

  ipcMain.handle(IpcChannel.OnlineSubtitlesStatus, () => service.status())
  ipcMain.handle(IpcChannel.OnlineSubtitlesSave, (_event, value: unknown) => {
    const input =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
    const text = (key: string): string =>
      typeof input[key] === 'string' ? (input[key] as string) : ''
    return service.save({
      apiKey: text('apiKey'),
      username: text('username'),
      password: text('password')
    })
  })
  ipcMain.handle(IpcChannel.OnlineSubtitlesRemove, () => service.remove())

  ipcMain.handle(IpcChannel.OnlineSubtitlesSearch, (event) => {
    const player = fromPlayer(event.sender)
    if (!player) return { ok: false, message: 'Přehrávač neběží.' }
    const item = tracker.current
    return service.search(
      { path: player.currentFile, library: item ? playback.libraryInfo(item.fileId) : null },
      loadSubtitleSettings(settings).languages
    )
  })

  ipcMain.handle(IpcChannel.OnlineSubtitlesDownload, async (event, fileId: unknown) => {
    const player = fromPlayer(event.sender)
    if (!player || !Number.isInteger(fileId)) return { ok: false, message: 'Přehrávač neběží.' }
    const { result, subtitle } = await service.download(fileId as number, player.currentFile)
    if (!subtitle) return result
    if (!(await player.addSubtitle(subtitle))) {
      return { ok: false, message: 'Titulky se stáhly, ale přehrávač je nenačetl.' }
    }
    // Stažené titulky se příště vyberou samy (stejný jazyk a název souboru).
    const item = tracker.current
    if (item) {
      playback.saveTrackPreference(item.titleId, 'sub', {
        language: subtitle.language,
        title: subtitle.title
      })
    }
    return result
  })
}

function registerPlayerIpc(): void {
  ipcMain.handle(IpcChannel.PlayerOpenFile, async (event): Promise<OpenFileResult> => {
    const host = BrowserWindow.fromWebContents(event.sender)
    if (!host) return { ok: false, reason: 'error', message: 'Okno aplikace nebylo nalezeno.' }
    const picked = await dialog.showOpenDialog(host, {
      title: 'Vyber film',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: [...VIDEO_EXTENSIONS] }]
    })
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return { ok: false, reason: 'cancelled' }
    return play(host, file)
  })

  // Z knihovny se přehrává podle id – okno nikdy neposílá cestu k souboru.
  ipcMain.handle(IpcChannel.PlayerPlayFile, (event, payload: unknown): Promise<OpenFileResult> => {
    const request = parsePlayRequest(payload)
    const item = request ? playback.itemForFile(request.fileId) : undefined
    if (!request || !item) {
      return Promise.resolve({ ok: false, reason: 'error', message: 'Soubor není v knihovně.' })
    }
    if (!item.available) {
      return Promise.resolve({ ok: false, reason: 'error', message: 'Soubor teď není dostupný.' })
    }
    const startSec = request.from === 'resume' ? resumePosition(item) : undefined
    return play(BrowserWindow.fromWebContents(event.sender), item.path, item, startSec)
  })

  ipcMain.on(IpcChannel.PlayerCommand, (event, payload: unknown) => {
    // Příkazy přijímáme jen z ovládání běžícího přehrávače.
    if (!session || event.sender !== session.overlay.webContents) return
    const command = parsePlayerCommand(payload)
    if (command) session.handle(command)
  })
}

void app.whenReady().then(() => {
  if (!singleInstance) return
  const db = openDatabase(join(app.getPath('userData'), 'kinoteka.db'))
  const repository = new LibraryRepository(db)
  const library = new LibraryService(repository)
  const catalog = new CatalogRepository(db)
  playback = new PlaybackRepository(db)
  tracker = new PlaybackTracker(playback, () => broadcast(IpcChannel.LibraryChanged))
  const ffprobe = ffprobeExecutablePath()
  const probe = existsSync(ffprobe)
    ? new ProbeService(db, (path) => runFfprobe(ffprobe, path))
    : null
  if (!probe)
    console.warn(`Chybí ${ffprobe} – vlastnosti souborů se nezjistí (npm run fetch:ffmpeg).`)
  probe?.on('changed', () => broadcast(IpcChannel.LibraryChanged))

  // Ve vývoji jde TMDB přesměrovat na lokální „falešný“ server (KINOTEKA_DEV_TMDB_URL).
  const devTmdb = app.isPackaged ? undefined : process.env['KINOTEKA_DEV_TMDB_URL']
  settings = new SettingsRepository(db, {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data)
  })
  const metadata = new MetadataService(
    catalog,
    settings,
    // Síť přes Chromium (net.fetch): používá certifikáty a proxy Windows, takže funguje
    // i za antivirem nebo firemní proxy, které prověřují HTTPS.
    (credential) =>
      new TmdbClient({ credential, baseUrl: devTmdb && `${devTmdb}/3`, fetchImpl: chromiumFetch })
  )
  // Ve vývoji jde datový soubor IMDb přesměrovat na lokální kopii (KINOTEKA_DEV_IMDB_URL).
  const imdb = new ImdbService(catalog, settings, {
    fetch: chromiumFetch,
    cacheDir: join(app.getPath('userData'), 'cache', 'imdb'),
    url: app.isPackaged ? undefined : process.env['KINOTEKA_DEV_IMDB_URL']
  })
  imdb.on('changed', () => broadcast(IpcChannel.LibraryChanged))
  const images = new ImageCache(
    join(app.getPath('userData'), 'cache', 'tmdb'),
    devTmdb ? `${devTmdb}/t/p` : TMDB_IMAGE_URL,
    chromiumFetch
  )
  const clipsDir = join(app.getPath('userData'), 'cache', 'clips')
  kidsRepository = new KidsRepository(db)
  // Obrázky pohádek z TMDB (pořad podle názvu titulu) a vlastní obrázky titulů.
  const kidsArtwork = new KidsArtwork(kidsRepository, {
    client: () => metadata.client(),
    coverDir: join(app.getPath('userData'), 'cache', 'kids', 'tituly')
  })
  kidsArtwork.on('changed', () => broadcast(IpcChannel.KidsChanged))
  kidsTracker = new KidsTracker(kidsRepository, () => broadcast(IpcChannel.KidsChanged))
  kidsGuard = new KidsGuard(settings)
  // „Spouštět Kinotéku rovnou v dětském režimu“: okno se otevře zamčené v části Děti.
  if (kidsSettings().startInKids) kidsGuard.enter()
  handleMediaProtocol(
    images,
    clipsDir,
    {
      video: (id) => kidsRepository.thumbnailPath(id),
      title: (id) => kidsRepository.customCoverPath(id),
      ytVideo: (id) => ytRepository.thumbnailPath(id)
    },
    chromiumFetch,
    (titleId) => themes.path(titleId)
  )

  // Barvy z plakátů a klipy na pozadí – potřebují ffmpeg.
  const ffmpeg = binaryPath('ffmpeg', 'ffmpeg.exe')
  const previews = existsSync(ffmpeg)
    ? new PreviewService(
        catalog,
        settings,
        {
          poster: async (path) => (await images.get(path))?.data ?? null,
          pixels: (image) => posterPixels(ffmpeg, image),
          clip: (input, start, output, hdr) => makeClip(ffmpeg, input, start, output, hdr)
        },
        clipsDir
      )
    : null
  previews?.on('changed', () => broadcast(IpcChannel.LibraryChanged))

  // Nová shoda na TMDB = nové IMDb ID (hodnocení) a nový plakát (barvy).
  metadata.on('changed', () => {
    broadcast(IpcChannel.LibraryChanged)
    // Nově zadaný klíč TMDB = obrázky pro pohádky, které ještě žádné nemají.
    void kidsArtwork.run()
    void imdb.run()
    void previews?.run()
  })
  // Klipy potřebují délku souboru z analýzy.
  probe?.on('changed', () => void previews?.run())

  // Katalog se přestaví dřív, než se změna knihovny ohlásí oknům (posluchači běží v pořadí registrace).
  library.on('changed', () => {
    catalog.rebuild()
    void probe?.run()
    void metadata.run()
    void previews?.run()
  })
  catalog.rebuild()
  void probe?.run()
  void metadata.run()
  // Běžící seriály se obnovují jednou denně (termíny nových dílů) – i když aplikace běží dlouho.
  setInterval(() => void metadata.run(), 60 * 60 * 1000).unref()
  registerMetadataIpc(metadata)
  registerImdbIpc(imdb)
  // Sdílení mezi počítači přes Google Disk (SCOPE-SYNC.md). Ve vývoji jde Google nahradit
  // falešným serverem (KINOTEKA_DEV_GOOGLE_URL, scripts/fake-google.mjs) – bez prohlížeče.
  const devGoogle = app.isPackaged ? undefined : process.env['KINOTEKA_DEV_GOOGLE_URL']
  const googleClient =
    GOOGLE_CLIENT_ID !== ''
      ? { id: GOOGLE_CLIENT_ID, secret: GOOGLE_CLIENT_SECRET }
      : devGoogle
        ? { id: 'kinoteka-dev', secret: 'dev' }
        : null
  const journalSync = new JournalSync(db)
  // YT videa se připojí, až bude jejich knihovna (níž).
  const syncAdapters: SyncAdapter[] = [journalSync.diary, journalSync.ratings]
  const sync = new SyncService({
    db,
    settings,
    adapters: syncAdapters,
    client: googleClient,
    endpoints: devGoogle ? endpointsAt(devGoogle) : GOOGLE_ENDPOINTS,
    drive: devGoogle ? driveEndpointsAt(devGoogle) : DRIVE_ENDPOINTS,
    fetch: chromiumFetch,
    openUrl: devGoogle
      ? async (url) => void (await chromiumFetch(url))
      : (url) => shell.openExternal(url),
    onApplied: () => {
      broadcast(IpcChannel.LibraryChanged)
      broadcast(IpcChannel.YtChanged)
    }
  })
  syncRef = sync
  registerSyncIpc(sync)
  // Ovládání entity v Home Assistant (SCOPE-HA.md); ve vývoji scripts/fake-ha.mjs.
  const ha = new HaService({ settings })
  haRef = ha
  registerHaIpc(ha)
  haAutomation = new HaAutomation(ha)
  ha.on('changed', (status: HaStatus) => haAutomation?.entityChanged(status.entity?.state ?? null))
  ha.start()
  registerJournalIpc(new JournalRepository(db), () => {
    broadcast(IpcChannel.LibraryChanged)
    sync.soon()
  })
  const deletion = new DeletionService(repository, {
    trash: (path) => shell.trashItem(path),
    remove: (path) => rm(path),
    isPlaying: (path) => session !== null && tracker.current?.path === path,
    removedFromLibrary: (ids) => library.filesRemoved(ids)
  })
  ipcMain.handle(IpcChannel.DeletionPlan, (_event, ids: unknown) => {
    const fileIds = parseFileIds(ids)
    return fileIds ? deletion.plan(fileIds) : { files: [], totalSize: 0, network: false }
  })
  ipcMain.handle(IpcChannel.DeletionExecute, (_event, ids: unknown) => {
    const fileIds = parseFileIds(ids)
    return fileIds ? deletion.execute(fileIds) : { deleted: 0, failed: [] }
  })
  void imdb.run()
  void previews?.run()
  ipcMain.handle(IpcChannel.AudioGetSettings, () => loadAudioSettings(settings))
  ipcMain.handle(IpcChannel.AudioSaveSettings, (_event, value: unknown) =>
    saveAudioSettings(settings, value)
  )
  ipcMain.handle(IpcChannel.AudioListDevices, () => listAudioDevices(mpvExecutablePath()))
  const onlineSubtitles = new OnlineSubtitlesService({
    settings,
    fetchImpl: chromiumFetch,
    userAgent: `Kinoteka v${app.getVersion()}`,
    fallbackDir: downloadedSubtitlesDir(),
    conversionDir: subtitleCacheDir(),
    // Ve vývoji jde API přesměrovat na falešný server (KINOTEKA_DEV_OPENSUBTITLES_URL).
    baseUrl: app.isPackaged ? undefined : process.env['KINOTEKA_DEV_OPENSUBTITLES_URL']
  })
  registerOnlineSubtitlesIpc(onlineSubtitles)
  // Dětská část: stahování z YouTube přes yt-dlp (stáhne se do dat aplikace při prvním použití).
  const ytDlp = new YtDlpTool({
    dir: join(app.getPath('userData'), 'tools', 'yt-dlp'),
    fetch: chromiumFetch
  })
  const kidsDownloader = new KidsDownloader({
    tool: () => ytDlp.ensure(),
    folder: () => kidsFolder(settings),
    ffmpegDir: dirname(ffmpeg),
    nodePath: process.execPath,
    tempDir: join(app.getPath('temp'), 'kinoteka')
  })
  // Ústřední melodie: ruční volba, soubor vedle filmu; z odkazu stahuje yt-dlp z dětské části.
  const themeDownloader = new ThemeDownloader({
    tool: () => ytDlp.ensure(),
    ffmpegDir: dirname(ffmpeg),
    nodePath: process.execPath
  })
  const themesDir = join(app.getPath('userData'), 'themes')
  // Automaticky: odkaz z ThemerrDB podle ID z TMDB (ve vývoji jde přesměrovat na falešný server).
  const themerrUrl = app.isPackaged ? undefined : process.env['KINOTEKA_DEV_THEMERR_URL']
  const autoThemes: AutoThemes = new AutoThemes({
    db,
    dir: themesDir,
    enabled: () => loadThemeSettings(settings).autoDownload,
    lookup: (kind, tmdbId) => themerrYoutubeUrl(chromiumFetch, kind, tmdbId, themerrUrl),
    download: (url, dir, name) => themeDownloader.download(url, dir, name),
    hasLocalTheme: (titleId) => themes.hasLocalTheme(titleId)
  })
  const themes: ThemeService = new ThemeService({
    db,
    dir: themesDir,
    download: (url, dir, name) => themeDownloader.download(url, dir, name),
    auto: autoThemes
  })
  registerThemesIpc(settings, themes, autoThemes)
  // Nepoužívané melodie pryč, pak stahování toho, co chybí (nové tituly hlásí metadata).
  void themes.removeOrphans().then(() => autoThemes.run())
  metadata.on('changed', () => void autoThemes.run())
  const kidsLibrary = new KidsLibrary(kidsRepository, {
    folder: () => kidsFolder(settings),
    busy: () => kidsDownloader.busy,
    probeDuration: async (path) =>
      existsSync(ffprobe) ? (await runFfprobe(ffprobe, path)).durationSec || null : null,
    makeThumbnail: existsSync(ffmpeg)
      ? (input, atSec, output) => videoThumbnail(ffmpeg, input, atSec, output)
      : undefined,
    thumbnailDir: join(app.getPath('userData'), 'cache', 'kids'),
    trash: (path) => shell.trashItem(path),
    downloadingInto: (folder): boolean => kidsQueue.isDownloadingInto(folder)
  })
  kidsLibrary.on('changed', () => {
    broadcast(IpcChannel.KidsChanged)
    void kidsArtwork.run()
  })
  const kidsQueue = new KidsDownloadQueue({
    downloader: kidsDownloader,
    repository: kidsRepository,
    folder: () => kidsFolder(settings),
    scan: () => kidsLibrary.scan(),
    quickInfo: (videoId) => fetchOembed(chromiumFetch, videoId)
  })
  registerKidsIpc({
    settings,
    tool: ytDlp,
    downloader: kidsDownloader,
    queue: kidsQueue,
    library: kidsLibrary,
    repository: kidsRepository,
    artwork: kidsArtwork,
    guard: kidsGuard,
    play: playKids
  })
  void kidsArtwork.run()
  void kidsLibrary.scan().catch((error: Error) => console.warn(`Složka Kids: ${error.message}`))

  // YT videa: vlastní složka, podsložky = kategorie podle obsahu; údaje z YouTube přes yt-dlp.
  ytRepository = new YtRepository(db)
  ytTracker = new KidsTracker(ytRepository, () => broadcast(IpcChannel.YtChanged))
  const ytLibrary = new YtLibrary(ytRepository, {
    folder: () => ytFolder(settings),
    fetchInfo: async (youtubeId) => {
      try {
        return { ok: true, info: await kidsDownloader.fullInfo(youtubeId) }
      } catch (error) {
        const { message, retry } = error as Error & { retry?: boolean }
        return { ok: false, retry: retry ?? true, message }
      }
    },
    probeDuration: async (path) =>
      existsSync(ffprobe) ? (await runFfprobe(ffprobe, path)).durationSec || null : null,
    makeThumbnail: existsSync(ffmpeg)
      ? (input, atSec, output) => videoThumbnail(ffmpeg, input, atSec, output)
      : undefined,
    thumbnailDir: join(app.getPath('userData'), 'cache', 'yt'),
    trash: (path) => shell.trashItem(path),
    downloadingInto: (folder): boolean => ytQueueRef?.isDownloadingInto(folder) ?? false,
    busy: () => ytDownloaderRef?.busy ?? false,
    fetchThumbnail: (youtubeId) => youtubeThumbnail(chromiumFetch, youtubeId)
  })
  ytLibrary.on('changed', () => {
    broadcast(IpcChannel.YtChanged)
    sync.soon()
  })
  syncAdapters.push(ytCategoryAdapter(db, ytLibrary), ytVideoAdapter(db, ytLibrary))
  sync.start()
  // Stahování do YT videí: vlastní yt-dlp proces (souběžně se stahováním pohádek), stejný nástroj.
  const ytDownloader = new KidsDownloader({
    tool: () => ytDlp.ensure(),
    folder: () => ytFolder(settings),
    ffmpegDir: dirname(ffmpeg),
    nodePath: process.execPath,
    tempDir: join(app.getPath('temp'), 'kinoteka')
  })
  ytDownloaderRef = ytDownloader
  const ytQueue = new KidsDownloadQueue({
    downloader: ytDownloader,
    folder: () => ytFolder(settings),
    // Návrh jen podle názvu a kanálu (štítky z YouTube jsou až v údajích staženého videa).
    suggest: (meta) => {
      const name = matchCategory(
        metaFromInfo({ title: meta.title, channel: meta.channel }, meta.title),
        ytRepository.categories()
      )
      return { name, existing: name !== null }
    },
    // Online video jde ještě stáhnout do počítače – „už máš“ jen u staženého.
    alreadyIn: (videoId) => ytRepository.categoryOfYoutubeId(videoId, true),
    scan: () => ytLibrary.scan(),
    quickInfo: (videoId) => fetchOembed(chromiumFetch, videoId),
    concurrency: () => ytConcurrency(settings),
    // Nedokončená stahování přežijí restart; yt-dlp pak naváže na rozpracované soubory.
    store: {
      load: () => {
        const saved = settings.get<SavedQueueItem[]>(QUEUE_SETTING)
        return Array.isArray(saved) ? saved : []
      },
      save: (items) => settings.set(QUEUE_SETTING, items)
    }
  })
  ytQueueRef = ytQueue
  // Online videa: adresy streamu přes stejný yt-dlp (vlastní proces, aby nečekal na stahování).
  const ytStreamDownloader = new KidsDownloader({
    tool: () => ytDlp.ensure(),
    folder: () => ytFolder(settings),
    ffmpegDir: dirname(ffmpeg),
    nodePath: process.execPath,
    tempDir: join(app.getPath('temp'), 'kinoteka')
  })
  ytStreamStop = () => ytStreamDownloader.stopAll()
  const streamsFile = join(app.getPath('userData'), 'cache', 'yt-streams.json')
  ytStreams = new YtStreamResolver(
    (youtubeId, quality) => ytStreamDownloader.streamInfo(youtubeId, quality),
    {
      // Čerstvé adresy YouTube první vteřiny odmítá – přehrávač by se otevřel a hned zavřel.
      ready: (stream) => waitUntilPlayable(stream),
      // Adresy platí ~6 h – uložené přežijí restart; před použitím se ověří (jiná síť).
      store: {
        load: () => {
          try {
            const saved: unknown = JSON.parse(readFileSync(streamsFile, 'utf8'))
            return Array.isArray(saved) ? (saved as SavedStream[]) : []
          } catch {
            return []
          }
        },
        save: (entries) => {
          try {
            mkdirSync(dirname(streamsFile), { recursive: true })
            writeFileSync(streamsFile, JSON.stringify(entries))
          } catch (error) {
            console.warn(`YT adresy: ${(error as Error).message}`)
          }
        }
      },
      verify: isPlayable
    }
  )
  // Najetí myší na online video: adresy se zjistí předem, kliknutí pak nečeká.
  ipcMain.handle(IpcChannel.YtPrefetch, (_event, id: unknown) => {
    if (!Number.isInteger(id)) return
    const item = ytPlayItem(ytRepository, id as number)
    if (item?.online) ytStreams?.prefetch(item.online, ytQualitySetting())
  })
  registerYtIpc({
    settings,
    library: ytLibrary,
    repository: ytRepository,
    play: playYt,
    downloader: ytDownloader,
    queue: ytQueue
  })
  void ytLibrary.scan().catch((error: Error) => console.warn(`Složka YT: ${error.message}`))
  // Pokračovat v nedokončeném stahování; rozpracované soubory bez videa ve frontě smazat.
  ytQueue.restore()
  void removeOrphanPartials(
    ytFolder(settings),
    new Set(ytQueue.items.map((item) => item.videoId))
  ).catch(() => undefined)
  ipcMain.handle(IpcChannel.SubtitlesGetSettings, () => loadSubtitleSettings(settings))
  ipcMain.handle(IpcChannel.SubtitlesSaveSettings, (_event, value: unknown) =>
    saveSubtitleSettings(settings, value)
  )
  ipcMain.handle(IpcChannel.PreviewStatus, () => previews?.status() ?? null)
  ipcMain.handle(IpcChannel.PreviewSetClipsEnabled, (_event, enabled: unknown) =>
    typeof enabled === 'boolean' ? previews?.setClipsEnabled(enabled) : undefined
  )
  ipcMain.handle(IpcChannel.CatalogListMovies, () => catalog.listMovies())
  ipcMain.handle(IpcChannel.CatalogListShows, () => catalog.listShows())
  ipcMain.handle(IpcChannel.CatalogClassify, (_event, id: unknown, value: unknown) => {
    const classification = value === null ? null : parseClassification(value)
    if (!Number.isInteger(id) || (value !== null && !classification)) return null
    catalog.setClassification(id as number, classification)
    // Přestavba katalogu a dohledání metadat nového titulu běží v posluchačích změny knihovny.
    library.catalogChanged()
    return catalog.titleOfFile(id as number)
  })
  ipcMain.handle(IpcChannel.CatalogClassifyFolder, (_event, id: unknown, value: unknown) => {
    const classification = parseClassification(value)
    if (!Number.isInteger(id) || classification?.kind !== 'episode') return null
    catalog.classifyFolder(id as number, classification)
    library.catalogChanged()
    return catalog.titleOfFile(id as number)
  })
  ipcMain.handle(IpcChannel.CatalogFileDetails, (_event, id: unknown) =>
    Number.isInteger(id) ? catalog.fileDetails(id as number) : null
  )
  registerLibraryIpc(library, repository)
  registerAppInfoIpc()
  registerUpdateIpc(settings)
  const autoScan = new AutoScan(settings, () => library.scanAll())
  autoScan.start()
  ipcMain.handle(IpcChannel.LibraryAutoScan, () => autoScan.enabled())
  ipcMain.handle(IpcChannel.LibrarySetAutoScan, (_event, enabled: unknown) => {
    if (typeof enabled === 'boolean') autoScan.setEnabled(enabled)
  })
  registerPlayerIpc()
  windowMode = new WindowMode(settings)
  ipcMain.handle(IpcChannel.WindowState, (event): WindowState => ({
    fullscreen: BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  }))
  ipcMain.handle(IpcChannel.WindowSetFullscreen, (event, fullscreen: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win === mainWindow && typeof fullscreen === 'boolean') win.setFullScreen(fullscreen)
  })

  const win = createMainWindow()

  // Jen pro vývoj: KINOTEKA_DEV_OPEN=<cesta> spustí přehrávání hned po startu.
  const devFile = process.env['KINOTEKA_DEV_OPEN']
  if (!app.isPackaged && devFile) {
    win.webContents.once('did-finish-load', () => {
      startPlayback(win, devFile).catch((error: Error) => console.error(error.message))
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
  app.on('will-quit', () => {
    // Náhledy a stahování z YouTube nesmí běžet dál bez aplikace.
    kidsDownloader.stopAll()
    ytDownloaderRef?.stopAll()
    ytStreamStop?.()
    themeDownloader.stopAll()
    syncRef?.stop()
    haRef?.stop()
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
