import { ipcMain } from 'electron'
import { parseHaAutomation, type HaSettingsPatch } from '../../shared/ha'
import { IpcChannel } from '../../shared/ipc'
import { broadcast } from '../broadcast'
import type { HaService } from './HaService'

/** Z okna přijme jen známé položky se správnými typy (token zůstává v hlavním procesu). */
function cleanPatch(value: unknown): HaSettingsPatch {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const patch: HaSettingsPatch = {}
  if (typeof raw['enabled'] === 'boolean') patch.enabled = raw['enabled']
  if (typeof raw['url'] === 'string') patch.url = raw['url']
  if (typeof raw['entityId'] === 'string' || raw['entityId'] === null)
    patch.entityId = raw['entityId'] as string | null
  if (typeof raw['label'] === 'string') patch.label = raw['label']
  if (typeof raw['token'] === 'string') patch.token = raw['token']
  if (raw['automation'] && typeof raw['automation'] === 'object')
    patch.automation = parseHaAutomation(raw['automation'])
  return patch
}

/** Nastavení → Home Assistant a žárovka v liště a v přehrávači. */
export function registerHaIpc(ha: HaService): void {
  ipcMain.handle(IpcChannel.HaStatus, () => ha.status())
  ipcMain.handle(IpcChannel.HaSave, (_event, patch: unknown) => ha.save(cleanPatch(patch)))
  ipcMain.handle(IpcChannel.HaTest, (_event, url: unknown, token: unknown) => ha.test(url, token))
  ipcMain.handle(IpcChannel.HaEntities, async () => {
    try {
      return { ok: true, entities: await ha.entities() }
    } catch (error) {
      return { ok: false, entities: [], message: (error as Error).message }
    }
  })
  ipcMain.handle(IpcChannel.HaToggle, () => ha.toggle())
  ha.on('changed', (status) => broadcast(IpcChannel.HaChanged, status))
}
