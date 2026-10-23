import { app, BrowserWindow, dialog, ipcMain, net, safeStorage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../shared/ipc'
import { VIDEO_EXTENSIONS } from '../shared/library'
import { parsePlayerCommand, type OpenFileResult } from '../shared/player'
import { broadcast } from './broadcast'
import { CatalogRepository } from './catalog/CatalogRepository'
import { registerImdbIpc } from './imdb/imdbIpc'
import { ImdbService } from './imdb/ImdbService'
import { openDatabase } from './db/database'
import { runFfprobe } from './media/ffprobe'
import { ImageCache } from './metadata/ImageCache'
import {
  handleMediaProtocol,
  registerMediaScheme,
  registerMetadataIpc
} from './metadata/metadataIpc'
import { MetadataService } from './metadata/MetadataService'
import { TMDB_IMAGE_URL, TmdbClient } from './metadata/TmdbClient'
import { ProbeService } from './media/ProbeService'
import { ffprobeExecutablePath } from './mpv/binary'
import { registerLibraryIpc } from './library/libraryIpc'
import { LibraryRepository } from './library/LibraryRepository'
import { LibraryService } from './library/LibraryService'
import { PlayerSession } from './player/PlayerSession'
import { hardenWebContents, loadRendererPage, preloadPath } from './rendererPage'
import { SettingsRepository } from './settings/SettingsRepository'
import { createMainWindowOptions } from './windowOptions'

// S DirectComposition kreslí Chromium obsah oken nad všechna vnořená nativní okna,
// takže by zakryl obraz, který mpv kreslí do okna aplikace (--wid).
app.commandLine.appendSwitch('disable-direct-composition')
registerMediaScheme()

let session: PlayerSession | null = null

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

async function startPlayback(host: BrowserWindow, file: string): Promise<void> {
  session?.close()
  const started = await PlayerSession.start({
    mainWindow: host,
    file,
    logFile: join(app.getPath('logs'), 'mpv.log'),
    onEnd: (info) => {
      if (session === started) session = null
      if (!host.isDestroyed()) host.webContents.send(IpcChannel.PlayerClosed, info)
    }
  })
  session = started
}

async function play(host: BrowserWindow | null, file: string): Promise<OpenFileResult> {
  if (!host) return { ok: false, reason: 'error', message: 'Okno aplikace nebylo nalezeno.' }
  try {
    await startPlayback(host, file)
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'error', message: (error as Error).message }
  }
}

function registerPlayerIpc(repository: LibraryRepository): void {
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
  ipcMain.handle(IpcChannel.PlayerPlayFile, (event, id: unknown): Promise<OpenFileResult> => {
    const file = Number.isInteger(id) ? repository.getFile(id as number) : undefined
    if (!file)
      return Promise.resolve({ ok: false, reason: 'error', message: 'Soubor není v knihovně.' })
    if (!file.available) {
      return Promise.resolve({ ok: false, reason: 'error', message: 'Soubor teď není dostupný.' })
    }
    return play(BrowserWindow.fromWebContents(event.sender), file.path)
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
  const ffprobe = ffprobeExecutablePath()
  const probe = existsSync(ffprobe)
    ? new ProbeService(db, (path) => runFfprobe(ffprobe, path))
    : null
  if (!probe)
    console.warn(`Chybí ${ffprobe} – vlastnosti souborů se nezjistí (npm run fetch:ffmpeg).`)
  probe?.on('changed', () => broadcast(IpcChannel.LibraryChanged))

  // Ve vývoji jde TMDB přesměrovat na lokální „falešný“ server (KINOTEKA_DEV_TMDB_URL).
  const devTmdb = app.isPackaged ? undefined : process.env['KINOTEKA_DEV_TMDB_URL']
  const settings = new SettingsRepository(db, {
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
  // Nová shoda na TMDB = nové IMDb ID, ke kterému se doplní hodnocení.
  metadata.on('changed', () => {
    broadcast(IpcChannel.LibraryChanged)
    void imdb.run()
  })
  handleMediaProtocol(
    new ImageCache(
      join(app.getPath('userData'), 'cache', 'tmdb'),
      devTmdb ? `${devTmdb}/t/p` : TMDB_IMAGE_URL,
      chromiumFetch
    )
  )

  // Katalog se přestaví dřív, než se změna knihovny ohlásí oknům (posluchači běží v pořadí registrace).
  library.on('changed', () => {
    catalog.rebuild()
    void probe?.run()
    void metadata.run()
  })
  catalog.rebuild()
  void probe?.run()
  void metadata.run()
  registerMetadataIpc(metadata)
  registerImdbIpc(imdb)
  void imdb.run()
  ipcMain.handle(IpcChannel.CatalogListMovies, () => catalog.listMovies())
  ipcMain.handle(IpcChannel.CatalogListShows, () => catalog.listShows())
  ipcMain.handle(IpcChannel.CatalogFileDetails, (_event, id: unknown) =>
    Number.isInteger(id) ? catalog.fileDetails(id as number) : null
  )
  registerLibraryIpc(library, repository)
  registerPlayerIpc(repository)

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
