import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import { broadcast } from '../broadcast'
import type { SettingsRepository } from '../settings/SettingsRepository'
import { AppUpdater } from './AppUpdater'

/** Veřejný repozitář Kinotéky – zdrojový kód i vydání (instalátor + latest.yml). */
const RELEASES_OWNER = 'Miroslave11'
const RELEASES_REPO = 'kinoteka-app'

/**
 * Automatické aktualizace jen v nainstalované aplikaci. Ve vývoji jdou vyzkoušet proti
 * vlastnímu serveru s latest.yml (KINOTEKA_DEV_UPDATE_URL=http://127.0.0.1:8767/).
 */
export function registerUpdateIpc(settings: SettingsRepository): AppUpdater {
  const devUrl = app.isPackaged ? undefined : process.env['KINOTEKA_DEV_UPDATE_URL']
  if (devUrl) {
    // Stejný tvar jako app-update.yml, který instalátor přibalí do resources.
    const config = join(app.getPath('userData'), 'dev-app-update.yml')
    writeFileSync(
      config,
      `provider: generic
url: ${devUrl}
updaterCacheDirName: kinoteka-dev-updater
`
    )
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.updateConfigPath = config
  }
  // Instalátor je vždy celý (offline), webový instalátor Kinotéka nepoužívá.
  autoUpdater.disableWebInstaller = true
  if (app.isPackaged && !devUrl) {
    // Vydání jsou ve veřejném repozitáři – čtou se bez klíče (nezávisle na app-update.yml).
    autoUpdater.setFeedURL({ provider: 'github', owner: RELEASES_OWNER, repo: RELEASES_REPO })
  }
  const updater = new AppUpdater(settings, app.isPackaged || devUrl ? autoUpdater : null)
  updater.on('changed', (state) => broadcast(IpcChannel.UpdateChanged, state))
  ipcMain.handle(IpcChannel.UpdateState, () => updater.state())
  ipcMain.handle(IpcChannel.UpdateCheck, () => updater.check())
  ipcMain.handle(IpcChannel.UpdateInstall, () => updater.installNow())
  ipcMain.handle(IpcChannel.UpdateSetAutoCheck, (_event, enabled: unknown) => {
    if (typeof enabled === 'boolean') updater.setAutoCheck(enabled)
  })
  updater.start()
  return updater
}
