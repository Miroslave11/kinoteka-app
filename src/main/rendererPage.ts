import { app, shell, type BrowserWindow } from 'electron'
import { join } from 'node:path'

export type RendererPage = 'index' | 'overlay'

export function loadRendererPage(win: BrowserWindow, page: RendererPage): Promise<void> {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) return win.loadURL(`${devServerUrl}/${page}.html`)
  return win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

/** Okno nikam nenaviguje; odkazy ven se otevírají v systémovém prohlížeči. */
export function hardenWebContents(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
}

export function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}
