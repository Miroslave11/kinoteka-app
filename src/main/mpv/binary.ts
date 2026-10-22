import { app } from 'electron'
import { join } from 'node:path'

/**
 * Přibalené programy: ve vývoji je stahují skripty `npm run fetch:mpv` a `npm run fetch:ffmpeg`
 * do resources/bin, v instalaci leží vedle aplikace.
 */
export function binaryPath(tool: 'mpv' | 'ffmpeg', executable: string): string {
  const binDir = app.isPackaged
    ? join(process.resourcesPath, 'bin')
    : join(app.getAppPath(), 'resources', 'bin')
  return join(binDir, tool, executable)
}

export const mpvExecutablePath = (): string => binaryPath('mpv', 'mpv.exe')
export const ffprobeExecutablePath = (): string => binaryPath('ffmpeg', 'ffprobe.exe')
