import { describe, expect, it } from 'vitest'
import { buildThemeArgs } from './ThemeDownloader'

describe('buildThemeArgs', () => {
  const args = buildThemeArgs({
    url: 'https://www.youtube.com/watch?v=SLBACEP6LsI',
    dir: 'C:\\data\\themes',
    name: '12-1700000000000',
    ffmpegDir: 'C:\\app\\ffmpeg',
    nodePath: 'C:\\app\\Kinotéka.exe',
    pathFile: 'C:\\data\\themes\\12.path.txt'
  })
  const after = (flag: string): string | undefined => args[args.indexOf(flag) + 1]

  it('stáhne jen zvuk ze začátku videa', () => {
    expect(after('-f')).toBe('ba[ext=m4a]/ba')
    expect(after('--download-sections')).toBe('*0-90')
    expect(args).toContain('--no-playlist')
  })

  it('uloží do složky melodií pod zadaným názvem a vypíše cestu', () => {
    expect(after('-P')).toBe('C:\\data\\themes')
    expect(after('-o')).toBe('12-1700000000000.%(ext)s')
    expect(after('--print-to-file')).toBe('after_move:%(filepath)s')
    expect(args.at(-1)).toBe('https://www.youtube.com/watch?v=SLBACEP6LsI')
  })

  it('použije stejné základní volby jako dětská část (certifikáty, Node z Electronu)', () => {
    expect(args).toContain('no-certifi')
    expect(args).toContain('node:C:\\app\\Kinotéka.exe')
    expect(after('--ffmpeg-location')).toBe('C:\\app\\ffmpeg')
  })
})
