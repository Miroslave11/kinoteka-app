import { BrowserWindow } from 'electron'

/** Pošle zprávu všem oknům aplikace. */
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
