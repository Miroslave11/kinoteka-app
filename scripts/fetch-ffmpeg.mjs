// Stáhne ffmpeg a ffprobe (build Gyan.dev „essentials“) do resources/bin/ffmpeg.
// Verze i kontrolní součet jsou pevné, aby každý build používal stejné nástroje.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const VERSION = '9.0.2'
const ASSET = `ffmpeg-${VERSION}-essentials_build.zip`
const URL = `https://github.com/GyanD/codexffmpeg/releases/download/${VERSION}/${ASSET}`
const SHA256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
const BINARIES = ['ffmpeg.exe', 'ffprobe.exe']

const targetDir = resolve(import.meta.dirname, '..', 'resources', 'bin', 'ffmpeg')
const versionFile = join(targetDir, 'VERSION')

if (
  BINARIES.every((name) => existsSync(join(targetDir, name))) &&
  existsSync(versionFile) &&
  readFileSync(versionFile, 'utf8').trim() === VERSION
) {
  console.log(`ffmpeg ${VERSION} už je stažené v ${targetDir}`)
  process.exit(0)
}

console.log(`Stahuji ${URL}`)
const response = await fetch(URL)
if (!response.ok) throw new Error(`Stažení selhalo: HTTP ${response.status}`)
const data = Buffer.from(await response.arrayBuffer())

const actual = createHash('sha256').update(data).digest('hex')
if (actual !== SHA256) {
  throw new Error(`Nesedí kontrolní součet ffmpeg: očekáván ${SHA256}, staženo ${actual}`)
}

const workDir = mkdtempSync(join(tmpdir(), 'kinoteka-ffmpeg-'))
try {
  const zipPath = join(workDir, ASSET)
  writeFileSync(zipPath, data)
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })
  // Z archivu stačí dva programy ze složky bin; tar.exe ze systému Windows umí zip.
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const root = `ffmpeg-${VERSION}-essentials_build`
  execFileSync(
    tar,
    [
      '-xf',
      zipPath,
      '-C',
      targetDir,
      '--strip-components=2',
      ...BINARIES.map((b) => `${root}/bin/${b}`)
    ],
    { stdio: 'inherit' }
  )
  for (const name of BINARIES) {
    if (!existsSync(join(targetDir, name))) throw new Error(`Archiv neobsahuje ${name}`)
  }
  writeFileSync(versionFile, `${VERSION}\n`)
  console.log(`ffmpeg ${VERSION} připraveno v ${targetDir}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
