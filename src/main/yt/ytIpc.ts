import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import {
  parseDownloadRequest,
  parseYoutubeLink,
  type KidsPreviewResult,
  type KidsQuality,
  type KidsQueueItem
} from '../../shared/kids'
import {
  parseYtManageAction,
  type YtCategory,
  type YtManageResult,
  type YtScanResult,
  type YtStatus
} from '../../shared/yt'
import { broadcast } from '../broadcast'
import type { KidsDownloader } from '../kids/KidsDownloader'
import type { KidsDownloadQueue } from '../kids/KidsDownloadQueue'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { YtLibrary } from './YtLibrary'
import type { YtRepository } from './YtRepository'

const FOLDER_SETTING = 'yt.folder'
const QUALITY_SETTING = 'yt.quality'

const ytQuality = (settings: SettingsRepository): KidsQuality => {
  const saved = settings.get<string>(QUALITY_SETTING)
  return saved === '2160' || saved === '720' ? saved : '1080'
}
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
  downloader: KidsDownloader
  queue: KidsDownloadQueue
}

export function registerYtIpc({
  settings,
  library,
  repository,
  play,
  downloader,
  queue
}: YtIpcDeps): void {
  // Přehrává se podle id – okno nikdy neposílá cestu k souboru.
  ipcMain.handle(IpcChannel.YtPlayVideo, (event, id: unknown) =>
    Number.isInteger(id)
      ? play(BrowserWindow.fromWebContents(event.sender), id as number)
      : { ok: false, reason: 'error', message: 'Video už ve složce není.' }
  )

  ipcMain.handle(IpcChannel.YtStatus, (): YtStatus => ({
    folder: ytFolder(settings),
    quality: ytQuality(settings),
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

  // ---------- stahování z YouTube ----------
  ipcMain.handle(
    IpcChannel.YtPreview,
    async (event, value: unknown): Promise<KidsPreviewResult> => {
      const link = typeof value === 'string' ? parseYoutubeLink(value) : null
      if (!link) return { ok: false, message: 'Tohle není odkaz na video ani playlist z YouTube.' }
      return queue.preview(link, (stage) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcChannel.YtPreviewStage, stage)
      })
    }
  )
  ipcMain.handle(IpcChannel.YtWarmUp, () => downloader.warmUp())
  ipcMain.handle(IpcChannel.YtEnqueue, async (_event, value: unknown) => {
    const request = parseDownloadRequest(value, { allowAuto: true })
    if (!request) return { ok: false, message: 'Neplatný požadavek.' }
    settings.set(QUALITY_SETTING, request.quality)
    return queue.enqueue(request)
  })
  // Online video: jen odkaz a náhled, nic se nestahuje.
  ipcMain.handle(IpcChannel.YtAddOnline, async (_event, value: unknown) => {
    const request = parseDownloadRequest(value, { allowAuto: true })
    if (!request) return { ok: false, message: 'Neplatný požadavek.' }
    settings.set(QUALITY_SETTING, request.quality)
    const found = await queue.entries(request)
    if (!found.ok) return found
    return { ok: true, ...(await library.addOnline(found.entries, request.title)) }
  })
  ipcMain.handle(IpcChannel.YtQueue, (): KidsQueueItem[] => queue.items)
  ipcMain.handle(IpcChannel.YtQueueRemove, (_event, id: unknown) =>
    Number.isInteger(id) ? queue.remove(id as number) : undefined
  )
  ipcMain.handle(IpcChannel.YtQueueClear, () => queue.clearFinished())

  // Průběh stahování chodí často – do oken nejvýš 4× za sekundu.
  let timer: NodeJS.Timeout | null = null
  queue.on('changed', () => {
    timer ??= setTimeout(() => {
      timer = null
      broadcast(IpcChannel.YtQueueChanged, queue.items)
    }, 250)
  })
}
