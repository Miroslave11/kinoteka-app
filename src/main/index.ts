import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { IpcChannel } from '../shared/ipc'
import { parsePlayerCommand, type OpenFileResult } from '../shared/player'
import { PlayerSession } from './player/PlayerSession'
import { hardenWebContents, loadRendererPage, preloadPath } from './rendererPage'
import { createMainWindowOptions } from './windowOptions'

// S DirectComposition kreslí Chromium obsah oken nad všechna vnořená nativní okna,
// takže by zakryl obraz, který mpv kreslí do okna aplikace (--wid).
app.commandLine.appendSwitch('disable-direct-composition')

const VIDEO_EXTENSIONS = ['mkv', 'mp4', 'm4v', 'avi', 'ts', 'm2ts', 'mov', 'wmv', 'webm']

let session: PlayerSession | null = null

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

ipcMain.handle(IpcChannel.PlayerOpenFile, async (event): Promise<OpenFileResult> => {
  const host = BrowserWindow.fromWebContents(event.sender)
  if (!host) return { ok: false, reason: 'error', message: 'Okno aplikace nebylo nalezeno.' }
  const picked = await dialog.showOpenDialog(host, {
    title: 'Vyber film',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: VIDEO_EXTENSIONS }]
  })
  const file = picked.filePaths[0]
  if (picked.canceled || !file) return { ok: false, reason: 'cancelled' }
  try {
    await startPlayback(host, file)
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'error', message: (error as Error).message }
  }
})

ipcMain.on(IpcChannel.PlayerCommand, (event, payload: unknown) => {
  // Příkazy přijímáme jen z ovládání běžícího přehrávače.
  if (!session || event.sender !== session.overlay.webContents) return
  const command = parsePlayerCommand(payload)
  if (command) session.handle(command)
})

void app.whenReady().then(() => {
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
