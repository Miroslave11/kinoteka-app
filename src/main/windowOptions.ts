import type { BrowserWindowConstructorOptions } from 'electron'

export const APP_BACKGROUND = '#07080c'

/**
 * Nastavení hlavního okna. UI nemá přístup k Node.js – vše jde přes úzké API z preloadu.
 */
export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Kinotéka',
    backgroundColor: APP_BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  }
}
