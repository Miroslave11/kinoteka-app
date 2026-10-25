import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import { THEME_EXTENSIONS, parseThemeSettings, type ThemeSettings } from '../../shared/theme'
import { broadcast } from '../broadcast'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { AutoThemes } from './AutoThemes'
import type { ThemeService } from './ThemeService'

const SETTINGS_KEY = 'themes.settings'

export function loadThemeSettings(settings: SettingsRepository): ThemeSettings {
  return parseThemeSettings(settings.get(SETTINGS_KEY))
}

const isId = (value: unknown): value is number => Number.isInteger(value)

/** Ústřední melodie: nastavení, melodie titulu (stránka filmu a seriálu), stahování. */
export function registerThemesIpc(
  settings: SettingsRepository,
  themes: ThemeService,
  auto: AutoThemes
): void {
  auto.on('changed', () => broadcast(IpcChannel.ThemeStatusChanged, auto.status()))
  auto.on('downloaded', (titleId) => broadcast(IpcChannel.ThemeDownloaded, titleId))
  ipcMain.handle(IpcChannel.ThemeGetSettings, () => loadThemeSettings(settings))
  ipcMain.handle(IpcChannel.ThemeSaveSettings, (_event, value: unknown) => {
    const parsed = parseThemeSettings(value)
    settings.set(SETTINGS_KEY, parsed)
    if (parsed.autoDownload) void auto.run()
    else broadcast(IpcChannel.ThemeStatusChanged, auto.status())
    return parsed
  })
  ipcMain.handle(IpcChannel.ThemeStatus, () => auto.status())
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
