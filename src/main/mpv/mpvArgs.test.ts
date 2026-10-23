import { describe, expect, it } from 'vitest'
import { buildMpvArgs, DEFAULT_PASSTHROUGH_CODECS, windowHandleToId } from './mpvArgs'

const base = {
  file: 'C:\\Filmy\\Den odhalení (2026) CZ DABING.mkv',
  windowId: '123456',
  ipcPath: '\\\\.\\pipe\\kinoteka-test',
  passthroughCodecs: DEFAULT_PASSTHROUGH_CODECS
}

describe('buildMpvArgs', () => {
  const args = buildMpvArgs(base)

  it('pokračování začne od uložené pozice', () => {
    expect(buildMpvArgs({ ...base, startSec: 1865.25 })).toContain('--start=1865.3')
    expect(args.some((arg) => arg.startsWith('--start'))).toBe(false)
  })

  it('vloží obraz do okna aplikace a otevře IPC', () => {
    expect(args).toContain('--wid=123456')
    expect(args).toContain('--input-ipc-server=\\\\.\\pipe\\kinoteka-test')
  })

  it('ignoruje uživatelskou konfiguraci mpv', () => {
    expect(args[0]).toBe('--no-config')
  })

  it('pošle Dolby i DTS do receiveru jako bitstream', () => {
    expect(args).toContain('--audio-spdif=ac3,eac3,dts,dts-hd,truehd')
    expect(args).toContain('--ao=wasapi')
  })

  it('vypne vlastní ovládání mpv', () => {
    expect(args).toEqual(
      expect.arrayContaining(['--osc=no', '--input-default-bindings=no', '--input-vo-keyboard=no'])
    )
  })

  it('soubor předá až za „--“', () => {
    expect(args.slice(-2)).toEqual(['--', base.file])
  })

  it('log přidá jen když je zadaný', () => {
    expect(args.some((arg) => arg.startsWith('--log-file'))).toBe(false)
    expect(buildMpvArgs({ ...base, logFile: 'C:\\log\\mpv.log' })).toContain(
      '--log-file=C:\\log\\mpv.log'
    )
  })
})

describe('windowHandleToId', () => {
  it('přečte 64bitový HWND', () => {
    const handle = Buffer.alloc(8)
    handle.writeBigUInt64LE(0x1a2b3cn)
    expect(windowHandleToId(handle)).toBe(String(0x1a2b3c))
  })

  it('přečte 32bitový HWND', () => {
    const handle = Buffer.alloc(4)
    handle.writeUInt32LE(4242)
    expect(windowHandleToId(handle)).toBe('4242')
  })
})
