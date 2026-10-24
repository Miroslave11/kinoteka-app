import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { IpcChannel } from '../shared/ipc'
import { DEFAULT_KIDS_SETTINGS, parseKidsSettings, type KidsSettings } from '../shared/kids'
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
import { JournalRepository } from './journal/JournalRepository'
import { ImdbService } from './imdb/ImdbService'
import { KidsArtwork } from './kids/KidsArtwork'
import { KidsDownloader } from './kids/KidsDownloader'
import { KidsDownloadQueue } from './kids/KidsDownloadQueue'
import { kidsFolder, KIDS_SETTINGS_KEY, registerKidsIpc } from './kids/kidsIpc'
import { KidsGuard } from './kids/KidsGuard'
import { KidsTracker, kidsPlayItem, PlayTimeMeter, type KidsPlayItem } from './kids/kidsPlayback'
import { KidsLibrary } from './kids/KidsLibrary'
import { KidsRepository } from './kids/KidsRepository'
import { fetchOembed } from './kids/oembed'
import { YtDlpTool } from './kids/YtDlpTool'
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
import { hardenWebContents, loadRendererPage, preloadPath } from './rendererPage'
import { SettingsRepository } from './settings/SettingsRepository'
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

/** fetch přes síť Chromia (net.fetch), který neumí objekt URL – převede ho na text. */
const chromiumFetch: typeof fetch = (input, init) =>
  net.fetch(input instanceof URL ? input.toString() : input, init)

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createMainWindowOptions(preloadPath()))
  mainWindow = win
  win.once('ready-to-show', () => win.show())
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
  started = await PlayerSession.start({
    mainWindow: host,
    file,
    title: item?.label,
    startSec,
    next: item ? nextLabel(item) : null,
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
      if (session === started) playNext(started)
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
}

/** „Další díl“ – načte se do běžícího přehrávače, okno se nezavře. */
function playNext(current: PlayerSession): void {
  const item = tracker.current
  const next = item && playback.nextEpisode(item)
  if (!next) return
  tracker.start(next)
  current.load({
    file: next.path,
    title: next.label,
    startSec: resumePosition(next),
    next: nextLabel(next),
    tracks: trackChoicesFor(next.path, next)
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
      title: (id) => kidsRepository.customCoverPath(id)
    },
    chromiumFetch
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
  registerJournalIpc(new JournalRepository(db), () => broadcast(IpcChannel.LibraryChanged))
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
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
