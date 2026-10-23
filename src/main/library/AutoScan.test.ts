import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import { AUTO_SCAN_INTERVAL_MS, AutoScan } from './AutoScan'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const setup = (): {
  auto: AutoScan
  scanAll: ReturnType<typeof vi.fn>
  settings: SettingsRepository
} => {
  const settings = new SettingsRepository(openDatabase(':memory:'))
  const scanAll = vi.fn(() => Promise.resolve())
  return { auto: new AutoScan(settings, scanAll), scanAll, settings }
}

describe('AutoScan', () => {
  it('skenuje chvíli po startu a pak každých 30 minut', async () => {
    const { auto, scanAll } = setup()
    auto.start()
    await vi.advanceTimersByTimeAsync(5000)
    expect(scanAll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(AUTO_SCAN_INTERVAL_MS)
    expect(scanAll).toHaveBeenCalledTimes(2)
    auto.stop()
  })

  it('vypnutý sken nespouští nic a vypnutí platí hned', async () => {
    const { auto, scanAll, settings } = setup()
    settings.set('library.autoScan', false)
    auto.start()
    await vi.advanceTimersByTimeAsync(AUTO_SCAN_INTERVAL_MS * 2)
    expect(scanAll).not.toHaveBeenCalled()

    auto.setEnabled(true)
    await vi.advanceTimersByTimeAsync(AUTO_SCAN_INTERVAL_MS)
    expect(scanAll).toHaveBeenCalledTimes(1)
    auto.setEnabled(false)
    await vi.advanceTimersByTimeAsync(AUTO_SCAN_INTERVAL_MS * 2)
    expect(scanAll).toHaveBeenCalledTimes(1)
  })

  it('chyba skenu ho nezastaví', async () => {
    const { auto, scanAll } = setup()
    scanAll.mockRejectedValueOnce(new Error('NAS offline'))
    auto.start()
    await vi.advanceTimersByTimeAsync(5000 + AUTO_SCAN_INTERVAL_MS)
    expect(scanAll).toHaveBeenCalledTimes(2)
    auto.stop()
  })
})
