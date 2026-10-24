import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import {
  DEFAULT_KIDS_SETTINGS,
  isValidPin,
  parseKidsSettings,
  parseDownloadRequest,
  parseManageAction,
  parseTmdbChoice,
  parseYoutubeLink,
  type KidsChallenge,
  type KidsManageResult,
  type KidsPreviewResult,
  type KidsQueueItem,
  type KidsMode,
  type KidsScanResult,
  type KidsSettings,
  type KidsStatus,
  type KidsTitle
} from '../../shared/kids'
import { broadcast } from '../broadcast'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { KidsArtwork } from './KidsArtwork'
import type { KidsDownloader } from './KidsDownloader'
import type { KidsDownloadQueue } from './KidsDownloadQueue'
import { KIDS_SETTINGS_KEY, type KidsGuard } from './KidsGuard'
import type { KidsLibrary } from './KidsLibrary'
import type { KidsRepository } from './KidsRepository'
import type { YtDlpTool } from './YtDlpTool'

const FOLDER_SETTING = 'kids.folder'
export { KIDS_SETTINGS_KEY }
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
  queue: KidsDownloadQueue
  library: KidsLibrary
  repository: KidsRepository
  artwork: KidsArtwork
  guard: KidsGuard
  /** Spustí pohádku v dětském přehrávači. */
  play: (host: BrowserWindow | null, videoId: number) => Promise<unknown>
}

export function registerKidsIpc({
  settings,
  tool,
  downloader,
  queue,
  library,
  repository,
  artwork,
  guard,
  play
}: KidsIpcDeps): void {
  const loadSettings = (): KidsSettings =>
    parseKidsSettings(settings.get(KIDS_SETTINGS_KEY) ?? DEFAULT_KIDS_SETTINGS)
  /** Změny (nastavení, stahování, mazání) jen mimo dětský režim, nebo za rodičovskou branou. */
  const forParent = <T>(work: () => T, denied: T): T => (guard.parentAccess() ? work() : denied)

  ipcMain.handle(IpcChannel.KidsStatus, async (): Promise<KidsStatus> => ({
    folder: kidsFolder(settings),
    ytDlpVersion: await tool.version(),
    busy: downloader.busy
  }))

  ipcMain.handle(IpcChannel.KidsGetSettings, () => loadSettings())
  ipcMain.handle(IpcChannel.KidsSaveSettings, (_event, value: unknown) =>
    forParent(() => {
      const saved = parseKidsSettings(value)
      const gateTurnedOn = saved.parentGate && !loadSettings().parentGate
      settings.set(KIDS_SETTINGS_KEY, saved)
      if (gateTurnedOn) guard.keepParentOpen()
      broadcast(IpcChannel.KidsChanged)
      return saved
    }, loadSettings())
  )

  // ---------- dětský režim a rodičovská brána ----------
  ipcMain.handle(IpcChannel.KidsMode, (): KidsMode => guard.mode(loadSettings().timeLimitMin))
  ipcMain.handle(IpcChannel.KidsEnter, () => guard.enter())
  ipcMain.handle(IpcChannel.KidsChallenge, (): KidsChallenge => guard.challenge())
  ipcMain.handle(IpcChannel.KidsUnlock, (_event, answer: unknown) => guard.unlock(answer))
  ipcMain.handle(IpcChannel.KidsLeaveParent, () => guard.leaveParent())
  ipcMain.handle(IpcChannel.KidsExit, () => guard.exit(loadSettings().protectExit))
  ipcMain.handle(IpcChannel.KidsSetPin, (_event, pin: unknown) =>
    pin === null || isValidPin(pin) ? guard.setPin(pin) : false
  )
  ipcMain.handle(IpcChannel.KidsResetPlayTime, () => {
    const done = guard.resetPlayTime()
    if (done) broadcast(IpcChannel.KidsChanged)
    return done
  })

  ipcMain.handle(IpcChannel.KidsPickFolder, async (event) => {
    if (!guard.parentAccess()) return null
    const host = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Složka s pohádkami',
      defaultPath: kidsFolder(settings),
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

  ipcMain.handle(IpcChannel.KidsCheckYtDlp, async () => {
    try {
      return { ok: true, version: await tool.checkNow() }
    } catch (error) {
      return { ok: false, message: `Aktualizaci nejde zkontrolovat: ${(error as Error).message}` }
    }
  })

  ipcMain.handle(IpcChannel.KidsListTitles, (): KidsTitle[] => repository.list())
  ipcMain.handle(IpcChannel.KidsScan, (): Promise<KidsScanResult> => library.scan())

  // ---------- stahování z YouTube (část Pro rodiče) ----------
  const denied = { ok: false as const, message: 'Stahovat můžou jen rodiče.' }
  ipcMain.handle(
    IpcChannel.KidsPreview,
    async (event, value: unknown): Promise<KidsPreviewResult> => {
      if (!guard.parentAccess()) return denied
      const link = typeof value === 'string' ? parseYoutubeLink(value) : null
      if (!link) return { ok: false, message: 'Tohle není odkaz na video ani playlist z YouTube.' }
      // Co se právě děje (na pomalém počítači trvá yt-dlp i minutu) – text na tlačítku.
      return queue.preview(link, (stage) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcChannel.KidsPreviewStage, stage)
      })
    }
  )
  ipcMain.handle(IpcChannel.KidsWarmUp, () =>
    forParent(() => downloader.warmUp(), Promise.resolve())
  )
  ipcMain.handle(IpcChannel.KidsEnqueue, async (_event, value: unknown) => {
    if (!guard.parentAccess()) return denied
    const request = parseDownloadRequest(value)
    return request ? queue.enqueue(request) : { ok: false, message: 'Neplatný požadavek.' }
  })
  ipcMain.handle(IpcChannel.KidsQueue, (): KidsQueueItem[] => queue.items)
  ipcMain.handle(IpcChannel.KidsQueueRemove, (_event, id: unknown) =>
    forParent(() => (Number.isInteger(id) ? queue.remove(id as number) : undefined), undefined)
  )
  ipcMain.handle(IpcChannel.KidsQueueClear, () => forParent(() => queue.clearFinished(), undefined))

  // Průběh stahování chodí často – do oken nejvýš 4× za sekundu.
  let timer: NodeJS.Timeout | null = null
  queue.on('changed', () => {
    timer ??= setTimeout(() => {
      timer = null
      broadcast(IpcChannel.KidsQueueChanged, queue.items)
    }, 250)
  })

  // Přehrává se podle id – okno nikdy neposílá cestu k souboru.
  ipcMain.handle(IpcChannel.KidsPlayVideo, (event, id: unknown) =>
    Number.isInteger(id)
      ? play(BrowserWindow.fromWebContents(event.sender), id as number)
      : { ok: false, reason: 'error', message: 'Video už ve složce není.' }
  )

  ipcMain.handle(IpcChannel.KidsSetFavorite, (_event, kind: unknown, id: unknown, on: unknown) => {
    if ((kind !== 'title' && kind !== 'video') || !Number.isInteger(id) || typeof on !== 'boolean')
      return
    repository.setFavorite(kind, id as number, on)
    broadcast(IpcChannel.KidsChanged)
  })

  // ---------- správa titulů (část Pro rodiče) ----------
  ipcMain.handle(IpcChannel.KidsManageTitles, () => ({
    folder: kidsFolder(settings),
    titles: guard.parentAccess() ? repository.list({ includeEmpty: true }) : []
  }))
  ipcMain.handle(
    IpcChannel.KidsManage,
    async (_event, value: unknown): Promise<KidsManageResult> => {
      if (!guard.parentAccess()) return { ok: false, message: 'Upravovat můžou jen rodiče.' }
      const action = parseManageAction(value)
      return action ? library.manage(action) : { ok: false, message: 'Neplatný požadavek.' }
    }
  )

  ipcMain.handle(IpcChannel.KidsSearchTmdb, async (_event, query: unknown) => {
    if (!guard.parentAccess()) return { ok: false, message: 'Upravovat můžou jen rodiče.' }
    if (typeof query !== 'string' || !query.trim() || query.length > 300)
      return { ok: false, message: 'Napiš název pořadu.' }
    try {
      return { ok: true, results: await artwork.search(query.trim()) }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  })
  ipcMain.handle(
    IpcChannel.KidsChooseTmdb,
    async (_event, titleId: unknown, value: unknown): Promise<KidsManageResult> => {
      if (!guard.parentAccess()) return { ok: false, message: 'Upravovat můžou jen rodiče.' }
      const choice = parseTmdbChoice(value)
      if (!Number.isInteger(titleId) || choice === undefined)
        return { ok: false, message: 'Neplatný požadavek.' }
      return artwork.choose(titleId as number, choice)
    }
  )
  ipcMain.handle(
    IpcChannel.KidsPickCover,
    async (event, titleId: unknown): Promise<KidsManageResult | null> => {
      if (!guard.parentAccess()) return { ok: false, message: 'Upravovat můžou jen rodiče.' }
      if (!Number.isInteger(titleId)) return { ok: false, message: 'Neplatný požadavek.' }
      const host = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: 'Obrázek titulu',
        filters: [{ name: 'Obrázky', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
        properties: ['openFile'] as 'openFile'[]
      }
      const picked = host
        ? await dialog.showOpenDialog(host, options)
        : await dialog.showOpenDialog(options)
      const file = picked.filePaths[0]
      if (picked.canceled || !file) return null
      return artwork.setCustomCover(titleId as number, file)
    }
  )

  ipcMain.handle(IpcChannel.KidsOpenFolder, async () => {
    await shell.openPath(kidsFolder(settings))
  })
}
