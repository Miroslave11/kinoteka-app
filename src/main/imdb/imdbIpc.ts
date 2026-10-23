import { ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { ImdbService } from './ImdbService'

export function registerImdbIpc(imdb: ImdbService): void {
  ipcMain.handle(IpcChannel.ImdbStatus, () => imdb.status())
  ipcMain.handle(IpcChannel.ImdbSetEnabled, (_event, enabled: unknown) => {
    if (typeof enabled === 'boolean') imdb.setEnabled(enabled)
  })
  ipcMain.handle(IpcChannel.ImdbUpdateNow, () => imdb.updateNow())
}
