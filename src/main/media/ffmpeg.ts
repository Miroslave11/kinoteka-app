import { spawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import { rename, rm } from 'node:fs/promises'
import { CLIP_SECONDS } from './clipTimes'

/** Velikost zmenšeného plakátu pro výpočet barev. */
export const POSTER_SAMPLE = { width: 32, height: 48 }

interface RunOptions {
  input?: Buffer
  timeoutMs: number
}

/** Spustí ffmpeg se sníženou prioritou, aby nebrzdil přehrávání ani zbytek systému. */
function runFfmpeg(executable: string, args: string[], options: RunOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-hide_banner', '-nostdin', '-v', 'error', ...args], {
      windowsHide: true,
      stdio: [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe']
    })
    try {
      if (child.pid) setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL)
    } catch {
      // Priorita je jen zdvořilost – když ji systém nedovolí, nevadí.
    }
    const stdout: Buffer[] = []
    let stderr = ''
    child.stdout!.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const timer = setTimeout(() => child.kill(), options.timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(stdout))
      else reject(new Error(stderr.trim().split('\n').at(-1) || `ffmpeg skončil s kódem ${code}`))
    })
    if (options.input) child.stdin!.end(options.input)
  })
}

/** Pixely zmenšeného plakátu (RGB, POSTER_SAMPLE). */
export async function posterPixels(executable: string, image: Buffer): Promise<Uint8Array> {
  const { width, height } = POSTER_SAMPLE
  const data = await runFfmpeg(
    executable,
    [
      '-i',
      'pipe:0',
      '-vf',
      `scale=${width}:${height}`,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ],
    { input: image, timeoutMs: 20_000 }
  )
  return new Uint8Array(data)
}

/** HDR obraz převedený do SDR, jinak by klip vypadal vybledle. */
const HDR_TO_SDR =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv'

export function clipArgs(input: string, startSec: number, output: string, hdr: boolean): string[] {
  const filters = [hdr ? HDR_TO_SDR : null, 'scale=1280:-2', 'format=yuv420p']
    .filter(Boolean)
    .join(',')
  return [
    // -ss před -i = rychlé skočení na klíčový snímek bez dekódování celého začátku filmu
    '-ss',
    String(startSec),
    '-i',
    input,
    '-t',
    String(CLIP_SECONDS),
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-dn',
    '-vf',
    filters,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '26',
    '-threads',
    '2',
    '-movflags',
    '+faststart',
    '-y',
    output
  ]
}

/** Vyřízne tichý klip pro pozadí (H.264, šířka 1280). Zapisuje přes dočasný soubor. */
export async function makeClip(
  executable: string,
  input: string,
  startSec: number,
  output: string,
  hdr: boolean
): Promise<void> {
  const temporary = output.replace(/\.mp4$/, '.part.mp4')
  try {
    await runFfmpeg(executable, clipArgs(input, startSec, temporary, hdr), {
      timeoutMs: 5 * 60_000
    })
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
}

/** Obrázek z videa (náhled dětského videa bez obrázku z YouTube), šířka 480. */
export async function videoThumbnail(
  executable: string,
  input: string,
  atSec: number,
  output: string
): Promise<void> {
  const temporary = output.replace(/\.jpg$/, '.part.jpg')
  try {
    await runFfmpeg(
      executable,
      ['-ss', String(atSec), '-i', input, '-frames:v', '1', '-vf', 'scale=480:-2', '-y', temporary],
      { timeoutMs: 60_000 }
    )
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
}
