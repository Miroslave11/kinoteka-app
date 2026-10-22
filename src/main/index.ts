import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { createMainWindowOptions } from './windowOptions'

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createMainWindowOptions(join(__dirname, '../preload/index.js')))

  win.once('ready-to-show', () => win.show())

  // Odkazy ven se otevírají v systémovém prohlížeči, nikdy uvnitř aplikace.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

void app.whenReady().then(() => {
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
