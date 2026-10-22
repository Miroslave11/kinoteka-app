import { describe, expect, it } from 'vitest'
import { createMainWindowOptions } from './windowOptions'

describe('createMainWindowOptions', () => {
  const options = createMainWindowOptions('C:/app/preload.js')

  it('izoluje UI od Node.js', () => {
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    })
  })

  it('použije zadaný preload', () => {
    expect(options.webPreferences?.preload).toBe('C:/app/preload.js')
  })

  it('zobrazí okno až po načtení, aby neproblikl bílý podklad', () => {
    expect(options.show).toBe(false)
    expect(options.backgroundColor).toBe('#07080c')
  })
})
