import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import {
  DEFAULT_KIDS_SETTINGS,
  isValidPin,
  parseKidsSettings,
  parseYoutubeUrl,
  type KidsChallenge,
  type KidsDownloadResult,
  type KidsMode,
  type KidsScanResult,
  type KidsSettings,
  type KidsStatus,
  type KidsTitle
} from '../../shared/kids'
import { broadcast } from '../broadcast'
import type { SettingsRepository } from '../settings/SettingsRepository'
import type { KidsDownloader } from './KidsDownloader'
import type { KidsGuard } from './KidsGuard'
import type { KidsLibrary } from './KidsLibrary'
import type { KidsRepository } from './KidsRepository'
import type { YtDlpTool } from './YtDlpTool'

const FOLDER_SETTING = 'kids.folder'
export const KIDS_SETTINGS_KEY = 'kids.settings'
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
  guard: KidsGuard
  /** Spustí pohádku v dětském přehrávači. */
  play: (host: BrowserWindow | null, videoId: number) => Promise<unknown>
}

export function registerKidsIpc({
  settings,
  tool,
  downloader,
  library,
  repository,
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
      settings.set(KIDS_SETTINGS_KEY, saved)
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
  ipcMain.handle(IpcChannel.KidsExit, () => guard.exit())
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

  ipcMain.handle(IpcChannel.KidsOpenFolder, async () => {
    await shell.openPath(kidsFolder(settings))
  })
}
