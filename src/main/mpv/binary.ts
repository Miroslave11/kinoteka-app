import { app } from 'electron'
import { join } from 'node:path'

/** mpv.exe stažené skriptem `npm run fetch:mpv` (ve vývoji) nebo přibalené v instalaci. */
export function mpvExecutablePath(): string {
  const binDir = app.isPackaged
    ? join(process.resourcesPath, 'bin')
    : join(app.getAppPath(), 'resources', 'bin')
  return join(binDir, 'mpv', 'mpv.exe')
}
