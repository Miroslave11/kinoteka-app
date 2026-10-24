import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import {
  parseYoutubeUrl,
  type KidsDownloadResult,
  type KidsScanResult,
  type KidsStatus,
  type KidsTitle
} from '../../shared/kids'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { KidsDownloader } from './KidsDownloader'
import type { KidsLibrary } from './KidsLibrary'
import type { KidsRepository } from './KidsRepository'
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

export interface KidsIpcDeps {
  settings: SettingsRepository
  tool: YtDlpTool
  downloader: KidsDownloader
  library: KidsLibrary
  repository: KidsRepository
  play: (host: BrowserWindow | null, file: string) => Promise<unknown>
}

export function registerKidsIpc({
  settings,
  tool,
  downloader,
  library,
  repository,
  play
}: KidsIpcDeps): void {
  ipcMain.handle(IpcChannel.KidsStatus, async (): Promise<KidsStatus> => ({
    folder: kidsFolder(settings),
    ytDlpVersion: await tool.version(),
    busy: downloader.busy
  }))

  ipcMain.handle(IpcChannel.KidsListTitles, (): KidsTitle[] => repository.list())
  ipcMain.handle(IpcChannel.KidsScan, (): Promise<KidsScanResult> => library.scan())

  ipcMain.handle(
    IpcChannel.KidsDownload,
    async (event, value: unknown): Promise<KidsDownloadResult> => {
      const url = typeof value === 'string' ? parseYoutubeUrl(value) : null
      if (!url) return { ok: false, message: 'Tohle není odkaz na video z YouTube.' }
      const youtubeId = new URL(url).searchParams.get('v')!
      const existing = repository.videoByYoutubeId(youtubeId)
      if (existing) {
        return {
          ok: false,
          message: existing.title
            ? `Tohle video už ve složce je – v titulu „${existing.title}“.`
            : 'Tohle video už ve složce je.'
        }
      }
      const sender = event.sender
      const forward = (progress: unknown): void => {
        if (!sender.isDestroyed()) sender.send(IpcChannel.KidsDownloadProgress, progress)
      }
      downloader.on('progress', forward)
      let result: KidsDownloadResult
      try {
        result = await downloader.download(url)
      } finally {
        downloader.off('progress', forward)
      }
      if (!result.ok) return result
      // Nové video se zařadí do titulu (a přesune do jeho podsložky).
      await library.scan()
      return { ...result, videoId: repository.videoByYoutubeId(youtubeId)?.id ?? null }
    }
  )

  // Přehrává se podle id – okno nikdy neposílá cestu k souboru.
  ipcMain.handle(IpcChannel.KidsPlayVideo, (event, id: unknown) => {
    const path = Number.isInteger(id) ? repository.videoPath(id as number) : null
    return path
      ? play(BrowserWindow.fromWebContents(event.sender), path)
      : { ok: false, reason: 'error', message: 'Video už ve složce není.' }
  })

  ipcMain.handle(IpcChannel.KidsOpenFolder, async () => {
    await shell.openPath(kidsFolder(settings))
  })
}
