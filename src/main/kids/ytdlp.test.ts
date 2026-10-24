import { describe, expect, it } from 'vitest'
import {
  buildDownloadArgs,
  buildInfoArgs,
  errorMessage,
  parseInfo,
  parseProgressLine,
  sha256For,
  YTDLP_FORMAT
} from './ytdlp'

describe('buildDownloadArgs', () => {
  const args = buildDownloadArgs({
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    folder: 'C:\\Videa\\Kids',
    ffmpegDir: 'C:\\App\\bin\\ffmpeg',
    nodePath: 'C:\\App\\Kinotéka.exe',
    pathFile: 'C:\\Temp\\yt.txt'
  })
  const after = (flag: string): string | undefined => args[args.indexOf(flag) + 1]

  it('jen Node z Electronu, certifikáty Windows, bez aktualizace a konfigurace', () => {
    expect(args).toEqual(
      expect.arrayContaining(['--no-update', '--ignore-config', '--no-js-runtimes'])
    )
    expect(after('--js-runtimes')).toBe('node:C:\\App\\Kinotéka.exe')
    expect(after('--compat-options')).toBe('no-certifi')
    expect(after('--ffmpeg-location')).toBe('C:\\App\\bin\\ffmpeg')
  })

  it('mp4 do 1080p s náhledem a údaji, jedno video do složky', () => {
    expect(after('-f')).toBe(YTDLP_FORMAT)
    expect(after('--merge-output-format')).toBe('mp4')
    expect(args).toEqual(
      expect.arrayContaining(['--write-info-json', '--write-thumbnail', '--no-playlist'])
    )
    expect(after('--convert-thumbnails')).toBe('jpg')
    expect(after('-P')).toBe('C:\\Videa\\Kids')
    expect(after('-o')).toBe('%(title).150B [%(id)s].%(ext)s')
    expect(args.slice(-3)).toEqual([
      'after_move:%(filepath)s',
      'C:\\Temp\\yt.txt',
      'https://www.youtube.com/watch?v=jNQXAC9IVRw'
    ])
  })
})

describe('parseProgressLine', () => {
  it('obraz s celkovou velikostí, rychlostí a zbývajícím časem', () => {
    expect(parseProgressLine('[KTK] 50000 200000 NA 1048576 12 avc1.4d401f')).toEqual({
      phase: 'video',
      percent: 25,
      speed: 1048576,
      eta: 12
    })
  })

  it('zvuk (vcodec none) a odhad velikosti, když přesná chybí', () => {
    expect(parseProgressLine('[KTK] 1000 NA 4000 NA NA none')).toEqual({
      phase: 'audio',
      percent: 25,
      speed: null,
      eta: null
    })
  })

  it('jiné řádky ignoruje', () => {
    expect(parseProgressLine('[youtube] jNQXAC9IVRw: Downloading webpage')).toBeNull()
  })
})

describe('errorMessage', () => {
  it('srozumitelné chyby podle výpisu', () => {
    expect(errorMessage(['ERROR: [youtube] abc: Private video. Sign in'])).toMatch(/soukromé/)
    expect(errorMessage(['ERROR: [youtube] abc: Video unavailable'])).toMatch(/není dostupné/)
    expect(errorMessage(['ERROR: [youtube] aaaaaaaaaaa: This video is unavailable'])).toMatch(
      /není dostupné/
    )
    expect(
      errorMessage([
        'ERROR: [youtube] abc: The uploader has not made this video available in your country'
      ])
    ).toMatch(/v Česku/)
    expect(
      errorMessage([
        'ERROR: [youtube] abc: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>'
      ])
    ).toMatch(/připojení k internetu/)
    expect(errorMessage(['ERROR: Sign in to confirm your age'])).toMatch(/věkem/)
  })

  it('neznámá chyba – poslední řádek bez předpon, jinak obecná zpráva', () => {
    expect(errorMessage(['WARNING: x', 'ERROR: [youtube] abc: Něco divného'])).toBe(
      'Stažení se nepovedlo: abc: Něco divného'
    )
    expect(errorMessage(['nic'])).toBe('Stažení se nepovedlo.')
  })
})

describe('sha256For', () => {
  const sums = [
    'b7af77f686e95f7845ce8d09d21957718febb8b48b30555adb9dd2292ad7bf14  yt-dlp',
    '33121D192D706E62F684A06F80918E3F3A8BA52AC3A65213B6951C39C7D9F555  yt-dlp.exe',
    '5f1e419f76e49c996061511ef9eacce50d4aa4959c34480539562e9e1295708d  yt-dlp.tar.gz'
  ].join('\n')

  it('najde součet přesně podle jména souboru', () => {
    expect(sha256For(sums, 'yt-dlp.exe')).toBe(
      '33121d192d706e62f684a06f80918e3f3a8ba52ac3a65213b6951c39c7d9f555'
    )
    expect(sha256For(sums, 'yt-dlp_x86.exe')).toBeNull()
  })
})

describe('buildInfoArgs', () => {
  it('playlist jen jako seznam, video bez playlistu', () => {
    const playlist = buildInfoArgs('https://www.youtube.com/playlist?list=PLx', 'C:\e.exe', true)
    expect(playlist).toEqual(expect.arrayContaining(['-J', '--flat-playlist', '--yes-playlist']))
    expect(playlist.at(-1)).toBe('https://www.youtube.com/playlist?list=PLx')
    const video = buildInfoArgs('https://youtu.be/jNQXAC9IVRw', 'C:\e.exe', false)
    expect(video).toContain('--no-playlist')
    expect(video).not.toContain('--flat-playlist')
  })
})

describe('parseInfo', () => {
  it('video: název, kanál, délka', () => {
    expect(
      parseInfo({ title: ' Bláto ', uploader: 'Peppa', duration: 311.6, entries: undefined })
    ).toEqual({ title: 'Bláto', channel: 'Peppa', durationSec: 312, entries: [] })
  })

  it('playlist: vynechá soukromá a smazaná videa', () => {
    const info = parseInfo({
      title: 'Klipy',
      channel: 'Prasátko Peppa',
      entries: [
        { id: 'aaaaaaaaaaa', title: 'Bláto' },
        { id: 'bbbbbbbbbbb', title: '[Private video]' },
        { id: 'ccccccccccc', title: null },
        { id: 'kratke', title: 'Špatné id' }
      ]
    })
    expect(info?.entries).toEqual([{ id: 'aaaaaaaaaaa', title: 'Bláto' }])
  })

  it('bez názvu → null', () => {
    expect(parseInfo({ title: '' })).toBeNull()
    expect(parseInfo('nesmysl')).toBeNull()
  })
})
