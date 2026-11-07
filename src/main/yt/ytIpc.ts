import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import {
  parseYtManageAction,
  type YtCategory,
  type YtManageResult,
  type YtScanResult,
  type YtStatus
} from '../../shared/yt'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { YtLibrary } from './YtLibrary'
import type { YtRepository } from './YtRepository'

const FOLDER_SETTING = 'yt.folder'
/** Domácí složka s videi (SCOPE-YT.md); na jiném počítači Videa\YT. */
const HOME_VIDEOS = 'C:\\Mirek_data\\09_Videa'

/** Složka s YT videi: z nastavení, jinak výchozí. */
export function ytFolder(settings: SettingsRepository): string {
  const saved = settings.get<string>(FOLDER_SETTING)
  if (saved) return saved
  return existsSync(HOME_VIDEOS) ? join(HOME_VIDEOS, 'YT') : join(app.getPath('videos'), 'YT')
}

export interface YtIpcDeps {
  settings: SettingsRepository
  library: YtLibrary
  repository: YtRepository
  /** Přehraje video v běžném přehrávači (rozkoukané od uložené pozice). */
  play: (host: BrowserWindow | null, videoId: number) => Promise<unknown>
}

export function registerYtIpc({ settings, library, repository, play }: YtIpcDeps): void {
  // Přehrává se podle id – okno nikdy neposílá cestu k souboru.
  ipcMain.handle(IpcChannel.YtPlayVideo, (event, id: unknown) =>
    Number.isInteger(id)
      ? play(BrowserWindow.fromWebContents(event.sender), id as number)
      : { ok: false, reason: 'error', message: 'Video už ve složce není.' }
  )

  ipcMain.handle(IpcChannel.YtStatus, (): YtStatus => ({
    folder: ytFolder(settings),
    pendingInfo: library.pendingInfo
  }))
  ipcMain.handle(IpcChannel.YtListCategories, (): YtCategory[] => repository.list())
  ipcMain.handle(IpcChannel.YtScan, (): Promise<YtScanResult> => library.scan())

  ipcMain.handle(IpcChannel.YtPickFolder, async (event) => {
    const host = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Složka s YT videi',
      defaultPath: ytFolder(settings),
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
    }
    const picked = host
      ? await dialog.showOpenDialog(host, options)
      : await dialog.showOpenDialog(options)
    const folder = picked.filePaths[0]
    if (picked.canceled || !folder) return null
    settings.set(FOLDER_SETTING, folder)
    await library.scan()
    return folder
  })

  ipcMain.handle(IpcChannel.YtManage, async (_event, value: unknown): Promise<YtManageResult> => {
    const action = parseYtManageAction(value)
    return action ? library.manage(action) : { ok: false, message: 'Neplatný požadavek.' }
  })

  ipcMain.handle(IpcChannel.YtOpenFolder, async () => {
    await shell.openPath(ytFolder(settings))
  })
}
