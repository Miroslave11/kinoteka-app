import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import {
  AppUpdater,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_START_DELAY_MS,
  updateErrorMessage,
  type Updater
} from './AppUpdater'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Napodobenina electron-updater: události se vyvolávají ručně přes `emit`. */
class FakeUpdater extends EventEmitter implements Updater {
  autoDownload = false
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn(() => Promise.resolve(null))
  quitAndInstall = vi.fn()
}

const setup = (): { app: AppUpdater; fake: FakeUpdater; settings: SettingsRepository } => {
  const settings = new SettingsRepository(openDatabase(':memory:'))
  const fake = new FakeUpdater()
  return { app: new AppUpdater(settings, fake), fake, settings }
}

describe('AppUpdater', () => {
  it('stahuje sám a instaluje při zavření; kontrola po startu a pak každých 6 hodin', async () => {
    const { app, fake } = setup()
    expect(fake.autoDownload).toBe(true)
    expect(fake.autoInstallOnAppQuit).toBe(true)
    app.start()
    await vi.advanceTimersByTimeAsync(UPDATE_START_DELAY_MS)
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(1)
    fake.emit('update-not-available')
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS)
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(2)
    app.stop()
  })

  it('průběh: kontrola → stahování → připraveno → instalace na požádání', () => {
    const { app, fake } = setup()
    const states: string[] = []
    app.on('changed', (state) => states.push(state.status))
    expect(app.installNow()).toBe(false)
    fake.emit('checking-for-update')
    fake.emit('update-available', { version: '1.2.0' })
    fake.emit('download-progress', { percent: 41.7 })
    expect(app.state()).toMatchObject({ status: 'downloading', version: '1.2.0', percent: 42 })
    fake.emit('update-downloaded', { version: '1.2.0' })
    // Chyba pozdější kontroly připravenou verzi nezahodí.
    fake.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(app.state()).toMatchObject({ status: 'ready', version: '1.2.0' })
    expect(states).toEqual(['checking', 'downloading', 'downloading', 'ready'])
    expect(app.installNow()).toBe(true)
    expect(fake.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('vypnutá automatická kontrola nic nespouští; ruční kontrola jde vždy', async () => {
    const { app, fake, settings } = setup()
    app.setAutoCheck(false)
    expect(settings.get('update.autoCheck')).toBe(false)
    app.start()
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2)
    expect(fake.checkForUpdates).not.toHaveBeenCalled()
    await app.check()
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(app.state().autoCheck).toBe(false)
  })

  it('během stahování se znovu nekontroluje; chyba kontroly je srozumitelná', async () => {
    const { app, fake } = setup()
    fake.emit('update-available', { version: '1.2.0' })
    await app.check()
    expect(fake.checkForUpdates).not.toHaveBeenCalled()
    fake.emit('error', new Error('getaddrinfo ENOTFOUND github.com'))
    expect(app.state()).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/internet/)
    })
  })

  it('vývojová verze (bez updateru) nic nehledá', async () => {
    const app = new AppUpdater(new SettingsRepository(openDatabase(':memory:')), null)
    app.start()
    expect(app.state().status).toBe('unsupported')
    expect((await app.check()).status).toBe('unsupported')
    expect(app.installNow()).toBe(false)
  })
})

describe('updateErrorMessage', () => {
  it('zatím žádné vydání a neznámá chyba', () => {
    expect(
      updateErrorMessage(new Error('Cannot find latest.yml in the latest release artifacts'))
    ).toMatch(/žádná verze/)
    expect(updateErrorMessage(new Error('Něco divného\nstack'))).toBe(
      'Aktualizace se nepovedla: Něco divného'
    )
  })
})
