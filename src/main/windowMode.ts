import type { WindowState } from '../shared/api'
import type { SettingsRepository } from './settings/SettingsRepository'

const FULLSCREEN_SETTING = 'window.fullscreen'

/** Část okna Electronu, kterou režim celé obrazovky potřebuje (v testech se podstrčí). */
export interface FullscreenWindow {
  isFullScreen(): boolean
  setFullScreen(flag: boolean): void
  on(event: 'enter-full-screen' | 'leave-full-screen', listener: () => void): unknown
}

/**
 * Režim hlavního okna: celá obrazovka (bez lišty okna a hlavního panelu Windows), nebo
 * běžné okno. Poslední volba se pamatuje a aplikace v ní příště nastartuje.
 */
export class WindowMode {
  constructor(private readonly settings: Pick<SettingsRepository, 'get' | 'set'>) {}

  /** Má hlavní okno nastartovat na celé obrazovce. */
  startFullscreen(): boolean {
    return this.settings.get<boolean>(FULLSCREEN_SETTING) ?? false
  }

  /** Sleduje okno: každou změnu režimu (ikonou, F11, Esc) uloží a ohlásí. */
  attach(win: FullscreenWindow, onChange: (state: WindowState) => void): void {
    const changed = (): void => {
      const fullscreen = win.isFullScreen()
      this.settings.set(FULLSCREEN_SETTING, fullscreen)
      onChange({ fullscreen })
    }
    win.on('enter-full-screen', changed)
    win.on('leave-full-screen', changed)
  }

  toggle(win: FullscreenWindow): void {
    win.setFullScreen(!win.isFullScreen())
  }
}
