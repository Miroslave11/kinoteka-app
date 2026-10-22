// Stáhne oficiální build mpv pro Windows do resources/bin/mpv.
// Verze i kontrolní součet jsou pevné, aby každý build používal stejné mpv.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MPV_VERSION = 'v0.41.0'
const ASSET = `mpv-${MPV_VERSION}-x86_64-w64-mingw32.zip`
const URL = `https://github.com/mpv-player/mpv/releases/download/${MPV_VERSION}/${ASSET}`
const SHA256 = 'a49811c0752c108b8260636f9c6f6fcb97406641c98b30f1e7b500dfb20177de'

const targetDir = resolve(import.meta.dirname, '..', 'resources', 'bin', 'mpv')
const versionFile = join(targetDir, 'VERSION')

if (existsSync(join(targetDir, 'mpv.exe')) && existsSync(versionFile)) {
  if (readFileSync(versionFile, 'utf8').trim() === MPV_VERSION) {
    console.log(`mpv ${MPV_VERSION} už je stažené v ${targetDir}`)
    process.exit(0)
  }
}

console.log(`Stahuji ${URL}`)
const response = await fetch(URL)
if (!response.ok) throw new Error(`Stažení selhalo: HTTP ${response.status}`)
const data = Buffer.from(await response.arrayBuffer())

const actual = createHash('sha256').update(data).digest('hex')
if (actual !== SHA256) {
  throw new Error(`Nesedí kontrolní součet mpv: očekáván ${SHA256}, staženo ${actual}`)
}

const workDir = mkdtempSync(join(tmpdir(), 'kinoteka-mpv-'))
try {
  const zipPath = join(workDir, ASSET)
  writeFileSync(zipPath, data)
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })
  // tar.exe ze systému Windows umí rozbalit i zip.
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(tar, ['-xf', zipPath, '-C', workDir], { stdio: 'inherit' })
  // Oficiální zip obsahuje ještě jeden zip (mpv-git-…-x86_64.zip) se samotnými soubory.
  const inner = readdirSync(workDir).find((name) => name !== ASSET && name.endsWith('.zip'))
  if (!inner) throw new Error('V archivu chybí vnitřní zip s mpv')
  execFileSync(tar, ['-xf', join(workDir, inner), '-C', targetDir], { stdio: 'inherit' })
  if (!existsSync(join(targetDir, 'mpv.exe'))) {
    throw new Error('Archiv neobsahuje mpv.exe v kořenové složce')
  }
  writeFileSync(versionFile, `${MPV_VERSION}\n`)
  console.log(`mpv ${MPV_VERSION} připraveno v ${targetDir}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
