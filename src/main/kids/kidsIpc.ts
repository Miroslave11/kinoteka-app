import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import { parseYoutubeUrl, type KidsDownloadResult, type KidsStatus } from '../../shared/kids'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { KidsDownloader } from './KidsDownloader'
import type { YtDlpTool } from './YtDlpTool'

const FOLDER_SETTING = 'kids.folder'
/** Domácí složka s videi (rozhodnuto v SCOPE-DETI.md); na jiném počítači Videa\Kids. */
const HOME_VIDEOS = 'C:\\Mirek_data\\09_Videa'

/** Složka s dětskými videi: z nastavení, jinak výchozí. */
export function kidsFolder(settings: SettingsRepository): string {
  const saved = settings.get<string>(FOLDER_SETTING)
  if (saved) return saved
  return existsSync(HOME_VIDEOS) ? join(HOME_VIDEOS, 'Kids') : join(app.getPath('videos'), 'Kids')
}

export function registerKidsIpc(
  settings: SettingsRepository,
  tool: YtDlpTool,
  downloader: KidsDownloader,
  play: (host: BrowserWindow | null, file: string) => Promise<unknown>
): void {
  ipcMain.handle(IpcChannel.KidsStatus, async (): Promise<KidsStatus> => ({
    folder: kidsFolder(settings),
    ytDlpVersion: await tool.version(),
    busy: downloader.busy
  }))

  ipcMain.handle(
    IpcChannel.KidsDownload,
    async (event, value: unknown): Promise<KidsDownloadResult> => {
      const url = typeof value === 'string' ? parseYoutubeUrl(value) : null
      if (!url) return { ok: false, message: 'Tohle není odkaz na video z YouTube.' }
      const sender = event.sender
      const forward = (progress: unknown): void => {
        if (!sender.isDestroyed()) sender.send(IpcChannel.KidsDownloadProgress, progress)
      }
      downloader.on('progress', forward)
      try {
        return await downloader.download(url)
      } finally {
        downloader.off('progress', forward)
      }
    }
  )

  // Přehrává se jen naposledy stažené video – okno neposílá cestu k souboru.
  ipcMain.handle(IpcChannel.KidsPlayLast, (event) =>
    downloader.lastFile
      ? play(BrowserWindow.fromWebContents(event.sender), downloader.lastFile)
      : { ok: false, reason: 'error', message: 'Zatím se nic nestáhlo.' }
  )

  ipcMain.handle(IpcChannel.KidsOpenFolder, async () => {
    await shell.openPath(kidsFolder(settings))
  })
}
