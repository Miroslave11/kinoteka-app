import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import { THEME_EXTENSIONS, parseThemeSettings, type ThemeSettings } from '../../shared/theme'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { ThemeService } from './ThemeService'

const SETTINGS_KEY = 'themes.settings'

export function loadThemeSettings(settings: SettingsRepository): ThemeSettings {
  return parseThemeSettings(settings.get(SETTINGS_KEY))
}

const isId = (value: unknown): value is number => Number.isInteger(value)

/** Ústřední melodie: nastavení a melodie titulu (stránka filmu a seriálu). */
export function registerThemesIpc(settings: SettingsRepository, themes: ThemeService): void {
  ipcMain.handle(IpcChannel.ThemeGetSettings, () => loadThemeSettings(settings))
  ipcMain.handle(IpcChannel.ThemeSaveSettings, (_event, value: unknown) => {
    const parsed = parseThemeSettings(value)
    settings.set(SETTINGS_KEY, parsed)
    return parsed
  })
  ipcMain.handle(IpcChannel.ThemeInfo, (_event, titleId: unknown) =>
    isId(titleId) ? themes.info(titleId) : null
  )
  ipcMain.handle(IpcChannel.ThemePickFile, async (event, titleId: unknown) => {
    if (!isId(titleId)) return null
    const options: Electron.OpenDialogOptions = {
      title: 'Ústřední melodie',
      properties: ['openFile'],
      filters: [{ name: 'Zvuk', extensions: [...THEME_EXTENSIONS] }]
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return null
    return themes.chooseFile(titleId, file)
  })
  ipcMain.handle(IpcChannel.ThemeSetYoutube, (_event, titleId: unknown, link: unknown) =>
    isId(titleId) && typeof link === 'string'
      ? themes.chooseYoutube(titleId, link)
      : { ok: false, message: 'Neplatný požadavek.' }
  )
  ipcMain.handle(IpcChannel.ThemeSetNone, (_event, titleId: unknown) =>
    isId(titleId) ? themes.setNone(titleId) : null
  )
  ipcMain.handle(IpcChannel.ThemeReset, (_event, titleId: unknown) =>
    isId(titleId) ? themes.reset(titleId) : null
  )
}
