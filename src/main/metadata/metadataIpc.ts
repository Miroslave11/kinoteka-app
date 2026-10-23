import { ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { ActionResult } from '../../shared/metadata'
import type { MetadataService } from './MetadataService'

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0
const fail = (error: unknown): ActionResult => ({ ok: false, message: (error as Error).message })

export function registerMetadataIpc(metadata: MetadataService): void {
  ipcMain.handle(IpcChannel.MetadataKeyStatus, () => metadata.keyStatus())
  ipcMain.handle(IpcChannel.MetadataSaveKey, (_event, key: unknown) =>
    typeof key === 'string' && key.length < 1024
      ? metadata.saveKey(key)
      : { ok: false, message: 'Neplatný klíč.' }
  )
  ipcMain.handle(IpcChannel.MetadataRemoveKey, () => metadata.removeKey())

  ipcMain.handle(IpcChannel.MetadataSearch, async (_event, input: unknown) => {
    const { kind, query, year } = (input ?? {}) as Record<string, unknown>
    if ((kind !== 'movie' && kind !== 'show') || typeof query !== 'string' || !query.trim())
      return []
    return metadata.search(
      kind,
      query.slice(0, 200),
      Number.isInteger(year) ? (year as number) : null
    )
  })

  ipcMain.handle(
    IpcChannel.MetadataApplyMatch,
    async (_event, titleId: unknown, tmdbId: unknown) => {
      if (!isId(titleId) || !isId(tmdbId)) return { ok: false, message: 'Neplatný výběr.' }
      try {
        await metadata.applyMatch(titleId, tmdbId)
        return { ok: true }
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(IpcChannel.MetadataRefresh, async (_event, titleId: unknown) => {
    if (isId(titleId)) await metadata.refresh(titleId)
  })
}
