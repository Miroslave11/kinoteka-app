import { ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import { cleanDeviceName, type SyncStatus } from '../../shared/sync'
import { broadcast } from '../broadcast'
import type { SyncService } from './SyncService'

/** Nastavení → Sdílení: stav, přihlášení ke Google, název počítače, synchronizace teď. */
export function registerSyncIpc(sync: SyncService): void {
  ipcMain.handle(IpcChannel.SyncStatus, (): SyncStatus => sync.status())
  ipcMain.handle(IpcChannel.SyncSignIn, async (): Promise<{ ok: boolean; message?: string }> => {
    try {
      await sync.signIn()
      return { ok: true }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  })
  ipcMain.handle(IpcChannel.SyncSignOut, () => sync.signOut())
  ipcMain.handle(IpcChannel.SyncNow, () => sync.syncNow())
  ipcMain.handle(IpcChannel.SyncSetDeviceName, (_event, value: unknown) => {
    const name = cleanDeviceName(value)
    if (name) sync.setDeviceName(name)
  })
  sync.on('changed', () => broadcast(IpcChannel.SyncChanged))
}
