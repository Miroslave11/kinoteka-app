import { describe, expect, it } from 'vitest'
import { createMainWindowOptions, createOverlayWindowOptions } from './windowOptions'

const SECURE = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true
}

describe('createMainWindowOptions', () => {
  const options = createMainWindowOptions('C:/app/preload.js')

  it('izoluje UI od Node.js', () => {
    expect(options.webPreferences).toMatchObject(SECURE)
  })

  it('použije zadaný preload', () => {
    expect(options.webPreferences?.preload).toBe('C:/app/preload.js')
  })

  it('zobrazí okno až po načtení, aby neproblikl bílý podklad', () => {
    expect(options.show).toBe(false)
    expect(options.backgroundColor).toBe('#07080c')
  })
})

describe('createOverlayWindowOptions', () => {
  const options = createOverlayWindowOptions('C:/app/preload.js')

  it('je průhledné okno bez rámečku mimo hlavní panel', () => {
    expect(options).toMatchObject({ transparent: true, frame: false, skipTaskbar: true })
  })

  it('izoluje UI od Node.js', () => {
    expect(options.webPreferences).toMatchObject(SECURE)
  })
})
