import { app, ipcMain, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AppInfo } from '../shared/api'
import { IpcChannel } from '../shared/ipc'
import { binaryPath } from './mpv/binary'

/** Verze přibalených programů ze souborů VERSION (zapisuje je skript fetch:mpv / fetch:ffmpeg). */
function bundledVersion(tool: 'mpv' | 'ffmpeg'): string | null {
  try {
    return readFileSync(`${dirname(binaryPath(tool, 'x'))}/VERSION`, 'utf8').trim() || null
  } catch {
    return null
  }
}

/** Nastavení → O aplikaci: verze a otevření složek s daty a záznamy; ukončení aplikace. */
export function registerAppInfoIpc(): void {
  ipcMain.handle(IpcChannel.AppInfo, (): AppInfo => ({
    version: app.getVersion(),
    mpv: bundledVersion('mpv'),
    ffmpeg: bundledVersion('ffmpeg'),
    dataPath: app.getPath('userData'),
    logsPath: app.getPath('logs')
  }))
  ipcMain.handle(IpcChannel.AppOpenFolder, async (_event, which: unknown) => {
    if (which !== 'data' && which !== 'logs') return
    await shell.openPath(app.getPath(which === 'data' ? 'userData' : 'logs'))
  })
  ipcMain.handle(IpcChannel.AppQuit, () => app.quit())
}
