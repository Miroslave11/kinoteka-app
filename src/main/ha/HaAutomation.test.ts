import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HA_AUTOMATION, type HaAutomationSettings } from '../../shared/ha'
import { HaAutomation, type HaAutomationTarget, type HaPlaybackRun } from './HaAutomation'

/** Falešná entita: setOn změní stav a ohlásí ho automatice jako Home Assistant. */
function setup(initial: string | null = 'on', rules: Partial<HaAutomationSettings> = {}) {
  let state = initial
  const calls: string[] = []
  const holder: { automation?: HaAutomation } = {}
  const target: HaAutomationTarget = {
    automation: () => ({ ...DEFAULT_HA_AUTOMATION, ...rules }),
    configured: () => true,
    entityState: () => state,
    setOn: async (on) => {
      calls.push(on ? 'on' : 'off')
      state = on ? 'on' : 'off'
      holder.automation?.entityChanged(state)
      return { ok: true }
    }
  }
  const automation = new HaAutomation(target, 2000, 2000)
  holder.automation = automation
  return {
    automation,
    calls,
    state: () => state,
    /** Ruční přepnutí (vypínač na zdi, klávesa L). */
    manual: (next: string) => {
      state = next
      automation.entityChanged(next)
    }
  }
}

const playing = { paused: false, ended: false, hasNext: false }
const paused = { paused: true, ended: false, hasNext: false }

/** Video se rozehrálo a hraje přes 2 s (akce „spuštění“ proběhne). */
async function playFor2s(run: HaPlaybackRun): Promise<void> {
  run.progress()
  await vi.advanceTimersByTimeAsync(2000)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('HaAutomation', () => {
  it('film: start zhasne po 2 s, pauza rozsvítí, pokračování zhasne, konec vrátí původní', async () => {
    const t = setup('on')
    const run = t.automation.begin('movie')
    await vi.advanceTimersByTimeAsync(5000)
    expect(t.calls).toEqual([]) // video se ještě nerozehrálo

    run.progress()
    await vi.advanceTimersByTimeAsync(1900)
    expect(t.state()).toBe('on')
    await vi.advanceTimersByTimeAsync(100)
    expect(t.state()).toBe('off')

    run.flags(paused)
    await vi.advanceTimersByTimeAsync(2000)
    expect(t.state()).toBe('on')

    run.flags(playing)
    await vi.advanceTimersByTimeAsync(0)
    expect(t.state()).toBe('off')

    run.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.state()).toBe('on')
    expect(t.calls).toEqual(['off', 'on', 'off', 'on'])
  })

  it('zavřeno do 2 s od spuštění: nic se nepřepne', async () => {
    const t = setup('on')
    const run = t.automation.begin('movie')
    run.progress()
    await vi.advanceTimersByTimeAsync(1500)
    run.end()
    await vi.advanceTimersByTimeAsync(5000)
    expect(t.calls).toEqual([])
  })

  it('pauza hned po spuštění: zhasne se až 2 s po pokračování', async () => {
    const t = setup('on')
    const run = t.automation.begin('movie')
    run.progress()
    await vi.advanceTimersByTimeAsync(1000)
    run.flags(paused)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.calls).toEqual([])
    run.flags(playing)
    await vi.advanceTimersByTimeAsync(1900)
    expect(t.calls).toEqual([])
    await vi.advanceTimersByTimeAsync(100)
    expect(t.calls).toEqual(['off'])
  })

  it('krátká pauza (přetáčení) se nepočítá', async () => {
    const t = setup('on')
    const run = t.automation.begin('movie')
    await playFor2s(run)
    run.flags(paused)
    await vi.advanceTimersByTimeAsync(1500)
    run.flags(playing)
    await vi.advanceTimersByTimeAsync(5000)
    expect(t.calls).toEqual(['off'])
  })

  it('zhasnuto už před filmem: na konci zůstane zhasnuto', async () => {
    const t = setup('off')
    const run = t.automation.begin('movie')
    await playFor2s(run)
    run.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls).toEqual([])
    expect(t.state()).toBe('off')
  })

  it('ruční přepnutí během filmu: konec už nic nevrací', async () => {
    const t = setup('on')
    const run = t.automation.begin('movie')
    await playFor2s(run)
    t.manual('on') // někdo rozsvítil
    run.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls).toEqual(['off'])
  })

  it('konec dílu s dalším dílem nic nepřepne, konec posledního ano', async () => {
    const t = setup('on')
    const run = t.automation.begin('series')
    await playFor2s(run)
    run.flags({ paused: false, ended: true, hasNext: true })
    run.flags(playing) // další díl se načetl
    await playFor2s(run)
    expect(t.calls).toEqual(['off'])

    run.flags({ paused: false, ended: true, hasNext: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(t.state()).toBe('on')
    // Zavření po konci už nic nedělá.
    run.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.calls).toEqual(['off', 'on'])
  })

  it('přehrát znovu po konci: zhasne zase až po 2 s', async () => {
    const t = setup('on')
    const run = t.automation.begin('movie')
    await playFor2s(run)
    run.flags({ paused: false, ended: true, hasNext: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(t.state()).toBe('on')
    run.flags(playing)
    await vi.advanceTimersByTimeAsync(1900)
    expect(t.state()).toBe('on')
    await vi.advanceTimersByTimeAsync(100)
    expect(t.state()).toBe('off')
  })

  it('vypnutá část (YT) nebo vypnutá automatika nic nedělá', async () => {
    const yt = setup('on', { sections: { movie: true, series: true, yt: false } })
    const ytRun = yt.automation.begin('yt')
    await playFor2s(ytRun)
    ytRun.end()
    const off = setup('on', { enabled: false })
    const offRun = off.automation.begin('movie')
    await playFor2s(offRun)
    offRun.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(yt.calls).toEqual([])
    expect(off.calls).toEqual([])
  })

  it('přímý přechod na další film převezme původní stav', async () => {
    const t = setup('on')
    const first = t.automation.begin('movie')
    await playFor2s(first)
    const second = t.automation.begin('movie')
    first.end() // starý přehrávač se zavřel až po spuštění nového
    await vi.advanceTimersByTimeAsync(0)
    expect(t.state()).toBe('off')
    // Druhý film zavřený dřív, než se rozehrál: i tak vrátí stav před prvním filmem.
    second.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.state()).toBe('on')
  })

  it('chyba Home Assistant se ohlásí jen jednou', async () => {
    const messages: string[] = []
    const automation = new HaAutomation(
      {
        automation: () => DEFAULT_HA_AUTOMATION,
        configured: () => true,
        entityState: () => 'on',
        setOn: async () => ({ ok: false, message: 'neodpovídá' })
      },
      2000,
      2000
    )
    const run = automation.begin('movie', (m) => messages.push(m))
    await playFor2s(run)
    run.flags(paused)
    await vi.advanceTimersByTimeAsync(2000)
    run.flags(playing)
    await vi.advanceTimersByTimeAsync(0)
    expect(messages).toEqual(['Home Assistant: neodpovídá'])
  })
})
