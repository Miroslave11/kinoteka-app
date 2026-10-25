import type {
  BaseWindowConstructorOptions,
  BrowserWindowConstructorOptions,
  Rectangle,
  WebPreferences
} from 'electron'

export const APP_BACKGROUND = '#07080c'

/** UI nemá přístup k Node.js – vše jde přes úzké API z preloadu. */
function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true
  }
}

export function createMainWindowOptions(
  preloadPath: string,
  fullscreen = false
): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    fullscreen,
    show: false,
    title: 'Kinotéka',
    backgroundColor: APP_BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(preloadPath)
  }
}

/**
 * Nativní okno bez webového obsahu, do kterého kreslí mpv. Musí být bez stránky –
 * Chromium by obraz mpv překryl.
 */
export function createVideoWindowOptions(bounds: Rectangle): BaseWindowConstructorOptions {
  return {
    ...bounds,
    minWidth: 640,
    minHeight: 360,
    show: false,
    title: 'Kinotéka',
    backgroundColor: '#000000',
    autoHideMenuBar: true
  }
}

/**
 * Průhledné okno s ovládáním přehrávače. Leží nad oknem, do kterého kreslí mpv,
 * protože obraz mpv (nativní okno) by HTML uvnitř téhož okna vždy překryl.
 */
export function createOverlayWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: 'Kinotéka – přehrávač',
    webPreferences: secureWebPreferences(preloadPath)
  }
}
