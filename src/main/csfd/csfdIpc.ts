import { ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { CsfdService } from './CsfdService'

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0

export function registerCsfdIpc(csfd: CsfdService): void {
  ipcMain.handle(IpcChannel.CsfdEnabled, () => csfd.enabled())
  ipcMain.handle(IpcChannel.CsfdSetEnabled, (_event, enabled: unknown) => {
    if (typeof enabled === 'boolean') csfd.setEnabled(enabled)
  })
  ipcMain.handle(IpcChannel.CsfdLink, (_event, titleId: unknown, url: unknown) =>
    isId(titleId) && typeof url === 'string' && url.length < 500
      ? csfd.link(titleId, url)
      : { ok: false, message: 'Neplatný odkaz.' }
  )
  ipcMain.handle(IpcChannel.CsfdRefresh, (_event, titleId: unknown) => {
    if (isId(titleId)) csfd.refresh(titleId)
  })
}
