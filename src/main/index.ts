import { app, BrowserWindow, dialog, ipcMain, net, safeStorage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../shared/ipc'
import { VIDEO_EXTENSIONS } from '../shared/library'
import { canResume, parsePlayRequest } from '../shared/playback'
import { parsePlayerCommand, type OpenFileResult } from '../shared/player'
import { subtitleStyleArgs, SUBTITLES_OFF } from '../shared/subtitles'
import {
  audioLaunchOptions,
  listAudioDevices,
  loadAudioSettings,
  saveAudioSettings
} from './audio/audioSettings'
import { broadcast } from './broadcast'
import { CatalogRepository } from './catalog/CatalogRepository'
import { registerImdbIpc } from './imdb/imdbIpc'
import { ImdbService } from './imdb/ImdbService'
import { openDatabase } from './db/database'
import { makeClip, posterPixels } from './media/ffmpeg'
import { runFfprobe } from './media/ffprobe'
import { PreviewService } from './media/PreviewService'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'
import { ImageCache } from './metadata/ImageCache'
import { registerMetadataIpc } from './metadata/metadataIpc'
import { MetadataService } from './metadata/MetadataService'
import { TMDB_IMAGE_URL, TmdbClient } from './metadata/TmdbClient'
import { ProbeService } from './media/ProbeService'
import { binaryPath, ffprobeExecutablePath, mpvExecutablePath } from './mpv/binary'
import { registerLibraryIpc } from './library/libraryIpc'
import { LibraryRepository } from './library/LibraryRepository'
import { LibraryService } from './library/LibraryService'
import { PlaybackRepository, type PlaybackItem } from './playback/PlaybackRepository'
import { PlaybackTracker } from './playback/PlaybackTracker'
import { PlayerSession } from './player/PlayerSession'
import type { TrackChoices } from './player/TrackSelector'
import { findExternalSubtitles, prepareSubtitle } from './subtitles/externalSubtitles'
import { loadSubtitleSettings, saveSubtitleSettings } from './subtitles/subtitleSettings'
import { hardenWebContents, loadRendererPage, preloadPath } from './rendererPage'
import { SettingsRepository } from './settings/SettingsRepository'
import { createMainWindowOptions } from './windowOptions'

// S DirectComposition kreslí Chromium obsah oken nad všechna vnořená nativní okna,
// takže by zakryl obraz, který mpv kreslí do okna aplikace (--wid).
app.commandLine.appendSwitch('disable-direct-composition')
registerMediaScheme()

let session: PlayerSession | null = null
let playback: PlaybackRepository
let tracker: PlaybackTracker
let settings: SettingsRepository

/** fetch přes síť Chromia (net.fetch), který neumí objekt URL – převede ho na text. */
const chromiumFetch: typeof fetch = (input, init) =>
  net.fetch(input instanceof URL ? input.toString() : input, init)

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createMainWindowOptions(preloadPath()))
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
        (await findExternalSubtitles(file)).map((found) =>
          prepareSubtitle(found, file, subtitleCacheDir())
        )
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
  handleMediaProtocol(images, clipsDir)

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
  registerMetadataIpc(metadata)
  registerImdbIpc(imdb)
  void imdb.run()
  void previews?.run()
  ipcMain.handle(IpcChannel.AudioGetSettings, () => loadAudioSettings(settings))
  ipcMain.handle(IpcChannel.AudioSaveSettings, (_event, value: unknown) =>
    saveAudioSettings(settings, value)
  )
  ipcMain.handle(IpcChannel.AudioListDevices, () => listAudioDevices(mpvExecutablePath()))
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
  ipcMain.handle(IpcChannel.CatalogFileDetails, (_event, id: unknown) =>
    Number.isInteger(id) ? catalog.fileDetails(id as number) : null
  )
  registerLibraryIpc(library, repository)
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
  app.on('will-quit', () => db.close())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
