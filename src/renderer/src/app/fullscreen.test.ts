import { describe, expect, it } from 'vitest'
import { escapeLeavesFullscreen } from './fullscreen'

const key = (
  overrides: Partial<{ key: string; defaultPrevented: boolean; repeat: boolean }> = {},
  target: { tagName?: string; isContentEditable?: boolean } | null = { tagName: 'BODY' }
): Parameters<typeof escapeLeavesFullscreen>[0] => ({
  key: 'Escape',
  defaultPrevented: false,
  repeat: false,
  target: target as EventTarget | null,
  ...overrides
})

describe('escapeLeavesFullscreen', () => {
  it('Esc na stránce opustí celou obrazovku', () => {
    expect(escapeLeavesFullscreen(key(), false)).toBe(true)
    expect(escapeLeavesFullscreen(key({}, null), false)).toBe(true)
  })

  it('jiné klávesy ne', () => {
    expect(escapeLeavesFullscreen(key({ key: 'Enter' }), false)).toBe(false)
  })

  it('s otevřeným dialogem Esc zavře jen dialog', () => {
    expect(escapeLeavesFullscreen(key(), true)).toBe(false)
  })

  it('v rozepsaném poli Esc ruší úpravu', () => {
    expect(escapeLeavesFullscreen(key({}, { tagName: 'INPUT' }), false)).toBe(false)
    expect(escapeLeavesFullscreen(key({}, { tagName: 'TEXTAREA' }), false)).toBe(false)
    expect(
      escapeLeavesFullscreen(key({}, { tagName: 'DIV', isContentEditable: true }), false)
    ).toBe(false)
  })

  it('už zpracovaný nebo držený Esc ne', () => {
    expect(escapeLeavesFullscreen(key({ defaultPrevented: true }), false)).toBe(false)
    expect(escapeLeavesFullscreen(key({ repeat: true }), false)).toBe(false)
  })
})
