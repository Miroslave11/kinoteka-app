import type { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KidsDownloadProgress } from '../../shared/kids'
import { KidsDownloader, killTree } from './KidsDownloader'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-kids-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/**
 * Falešný yt-dlp: vypíše řádky, případně „stáhne“ video (soubory vedle sebe a cesta
 * do souboru z --print-to-file) a skončí s daným kódem.
 */
function fakeYtDlp(lines: string[], code: number, video?: { name: string; info?: object }) {
  return vi.fn((_exe: string, args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      env: options.env
    })
    setImmediate(async () => {
      if (video) {
        const folder = args[args.indexOf('-P') + 1]!
        const path = join(folder, video.name)
        const base = path.replace(/\.mp4$/, '')
        await writeFile(path, 'video')
        await writeFile(`${base}.jpg`, Buffer.from([0xff, 0xd8, 0xff]))
        if (video.info) await writeFile(`${base}.info.json`, JSON.stringify(video.info))
        await writeFile(args.at(-2)!, `${path}\n`)
      }
      for (const line of lines) child.stdout.write(`${line}\n`)
      child.stdout.end()
      child.stderr.end()
      setImmediate(() => child.emit('close', code))
    })
    return child
  })
}

function downloader(spawnImpl: ReturnType<typeof fakeYtDlp>, tool = async () => 'C:\\yt-dlp.exe') {
  return new KidsDownloader({
    tool,
    folder: () => join(root, 'Kids'),
    ffmpegDir: 'C:\\ffmpeg',
    nodePath: 'C:\\electron.exe',
    tempDir: join(root, 'temp'),
    spawn: spawnImpl as unknown as typeof spawn
  })
}

describe('KidsDownloader', () => {
  it('stáhne video, hlásí průběh a vrátí údaje z YouTube s náhledem', async () => {
    const spawnImpl = fakeYtDlp(
      [
        '[youtube] abc: Downloading webpage',
        '[KTK] 100 400 NA 2048 3 avc1',
        '[KTK] 50 100 NA NA NA none',
        '[Merger] Merging formats into "x.mp4"'
      ],
      0,
      {
        name: 'Peppa Pig – Muddy Puddles [abcdefghijk].mp4',
        info: { title: 'Peppa Pig – Muddy Puddles', channel: 'Peppa Pig', duration: 311.6 }
      }
    )
    const kids = downloader(spawnImpl)
    const phases: KidsDownloadProgress['phase'][] = []
    kids.on('progress', (p) => phases.push(p.phase))

    const result = await kids.download('https://www.youtube.com/watch?v=abcdefghijk')

    expect(result).toEqual({
      ok: true,
      title: 'Peppa Pig – Muddy Puddles',
      channel: 'Peppa Pig',
      durationSec: 312,
      fileName: 'Peppa Pig – Muddy Puddles [abcdefghijk].mp4',
      thumbnail: 'data:image/jpeg;base64,/9j/'
    })
    expect(phases).toEqual(['tool', 'starting', 'video', 'audio', 'merging'])
    // yt-dlp spustí Electron jako Node.
    expect(spawnImpl.mock.calls[0]![2].env).toMatchObject({ ELECTRON_RUN_AS_NODE: '1' })
    expect(kids.busy).toBe(false)
  })

  it('bez údajů z YouTube použije název souboru', async () => {
    const kids = downloader(fakeYtDlp([], 0, { name: 'Krtek a autíčko [abcdefghijk].mp4' }))
    expect(await kids.download('https://youtu.be/abcdefghijk')).toMatchObject({
      ok: true,
      title: 'Krtek a autíčko [abcdefghijk]',
      channel: null,
      durationSec: null
    })
  })

  it('chyba yt-dlp → srozumitelná zpráva', async () => {
    const kids = downloader(fakeYtDlp(['ERROR: [youtube] abc: Video unavailable'], 1))
    expect(await kids.download('https://youtu.be/abcdefghijk')).toEqual({
      ok: false,
      message: 'Video není dostupné (smazané nebo blokované).'
    })
  })

  it('yt-dlp nejde stáhnout → chyba, nic se nespustí', async () => {
    const spawnImpl = fakeYtDlp([], 0)
    const kids = downloader(spawnImpl, async () => {
      throw new Error('GitHub vrátil chybu HTTP 503')
    })
    expect(await kids.download('https://youtu.be/abcdefghijk')).toEqual({
      ok: false,
      message: 'Nástroj yt-dlp nejde stáhnout: GitHub vrátil chybu HTTP 503'
    })
    expect(spawnImpl).not.toHaveBeenCalled()
  })

  it('druhé stahování během prvního odmítne', async () => {
    const kids = downloader(fakeYtDlp([], 0, { name: 'A [abcdefghijk].mp4' }))
    const first = kids.download('https://youtu.be/abcdefghijk')
    expect(await kids.download('https://youtu.be/abcdefghijk')).toMatchObject({ ok: false })
    expect(await first).toMatchObject({ ok: true })
  })
})

describe('killTree', () => {
  it('na Windows ukončí celý strom přes taskkill', () => {
    const child = { pid: 1234, kill: vi.fn() }
    const spawnImpl = vi.fn(() => Object.assign(new EventEmitter()))
    killTree(child as never, spawnImpl as never, 'win32')
    expect(spawnImpl).toHaveBeenCalledWith('taskkill', ['/pid', '1234', '/T', '/F'], {
      windowsHide: true
    })
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('taskkill nejde spustit → aspoň kill()', () => {
    const child = { pid: 1234, kill: vi.fn() }
    const taskkill = new EventEmitter()
    killTree(child as never, vi.fn(() => taskkill) as never, 'win32')
    taskkill.emit('error', new Error('ENOENT'))
    expect(child.kill).toHaveBeenCalled()
  })

  it('jinde stačí kill()', () => {
    const child = { pid: 1234, kill: vi.fn() }
    const spawnImpl = vi.fn()
    killTree(child as never, spawnImpl as never, 'linux')
    expect(spawnImpl).not.toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalled()
  })
})
