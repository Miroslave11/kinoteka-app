import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { WindowMode, type FullscreenWindow } from './windowMode'

function fakeSettings(initial: Record<string, unknown> = {}): {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
  values: Record<string, unknown>
} {
  const values = { ...initial }
  return {
    values,
    get: <T>(key: string) => values[key] as T | undefined,
    set: (key, value) => {
      values[key] = value
    }
  }
}

class FakeWindow extends EventEmitter implements FullscreenWindow {
  fullscreen = false
  isFullScreen(): boolean {
    return this.fullscreen
  }
  setFullScreen(flag: boolean): void {
    if (flag === this.fullscreen) return
    this.fullscreen = flag
    this.emit(flag ? 'enter-full-screen' : 'leave-full-screen')
  }
}

describe('WindowMode', () => {
  it('poprvé nastartuje v okně', () => {
    expect(new WindowMode(fakeSettings()).startFullscreen()).toBe(false)
  })

  it('nastartuje v naposledy použitém režimu', () => {
    expect(new WindowMode(fakeSettings({ 'window.fullscreen': true })).startFullscreen()).toBe(true)
  })

  it('přepínání uloží a ohlásí každou změnu', () => {
    const settings = fakeSettings()
    const mode = new WindowMode(settings)
    const win = new FakeWindow()
    const states: boolean[] = []
    mode.attach(win, (state) => states.push(state.fullscreen))

    mode.toggle(win)
    expect(settings.values['window.fullscreen']).toBe(true)
    mode.toggle(win)
    expect(settings.values['window.fullscreen']).toBe(false)
    expect(states).toEqual([true, false])
  })

  it('uloží i změnu, kterou udělal někdo jiný (F11, Windows)', () => {
    const settings = fakeSettings()
    const win = new FakeWindow()
    new WindowMode(settings).attach(win, () => undefined)
    win.setFullScreen(true)
    expect(settings.values['window.fullscreen']).toBe(true)
  })
})
