import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { VIDEO_EXTENSIONS } from '../../shared/library'
import {
  decodeSubtitle,
  SUBTITLE_EXTENSIONS,
  subtitleMatchesVideo,
  subtitleNameInfo,
  type SubtitleEncoding
} from '../../shared/subtitles'

/** Titulky v samostatném souboru, připravené pro mpv (`sub-add`). */
export interface ExternalSubtitle {
  /** Soubor pro mpv – originál, nebo kopie převedená do UTF-8. */
  path: string
  /** Název souboru pro panel stop. */
  title: string
  language: string | null
  forced: boolean
  encoding: SubtitleEncoding | null
}

/** Podsložky, kde se titulky často drží. */
const SUBTITLE_FOLDERS = ['subs', 'sub', 'subtitles', 'titulky']
const TEXT_EXTENSIONS = ['srt', 'ass', 'ssa', 'vtt', 'sub']

const extensionOf = (file: string): string => extname(file).slice(1).toLowerCase()

async function listDir(dir: string): Promise<{ name: string; isDir: boolean }[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      isDir: entry.isDirectory()
    }))
  } catch {
    return []
  }
}

/**
 * Titulky k videu: ve stejné složce nebo v podsložce Subs/Titulky, název začíná názvem videa.
 * VobSub (.idx + .sub) se bere jen přes .idx.
 */
export async function findExternalSubtitles(videoPath: string): Promise<string[]> {
  const dir = dirname(videoPath)
  const videoBase = basename(videoPath, extname(videoPath))
  const entries = await listDir(dir)
  const folders = entries
    .filter((e) => e.isDir && SUBTITLE_FOLDERS.includes(e.name.toLowerCase()))
    .map((e) => join(dir, e.name))

  const videoCount = entries.filter(
    (e) => !e.isDir && (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(e.name))
  ).length

  const found: string[] = []
  for (const folder of [dir, ...folders]) {
    const files = (folder === dir ? entries : await listDir(folder)).filter((e) => !e.isDir)
    const names = new Set(files.map((f) => f.name.toLowerCase()))
    for (const { name } of files) {
      const extension = extensionOf(name)
      if (!(SUBTITLE_EXTENSIONS as readonly string[]).includes(extension)) continue
      const base = basename(name, extname(name))
      if (extension === 'sub' && names.has(`${base}.idx`.toLowerCase())) continue
      // V podsložce Subs u jediného videa ve složce bývají i titulky jako „Czech.srt“.
      const ownFolder = folder !== dir && videoCount === 1
      if (!ownFolder && !subtitleMatchesVideo(videoBase, base)) continue
      found.push(join(folder, name))
    }
  }
  return found.sort((a, b) => a.localeCompare(b))
}

/**
 * Připraví soubor pro mpv: textové titulky v jiném kódování než UTF-8 převede
 * do kopie v cache (mpv by jinak češtinu ve Windows-1250 zkomolil).
 */
export async function prepareSubtitle(
  file: string,
  videoPath: string,
  cacheDir: string
): Promise<ExternalSubtitle> {
  const videoBase = basename(videoPath, extname(videoPath))
  const base = basename(file, extname(file))
  const info = subtitleMatchesVideo(videoBase, base)
    ? subtitleNameInfo(videoBase, base)
    : subtitleNameInfo('', base)
  const result: ExternalSubtitle = {
    path: file,
    title: basename(file),
    language: info.language,
    forced: info.forced,
    encoding: null
  }
  const extension = extensionOf(file)
  if (!TEXT_EXTENSIONS.includes(extension)) return result

  let bytes: Buffer
  try {
    bytes = await readFile(file)
  } catch {
    return result
  }
  // Binární .sub (VobSub bez .idx) nepřevádět.
  if (bytes.subarray(0, 4096).includes(0) && !(bytes[0] === 0xff || bytes[0] === 0xfe)) {
    return result
  }
  const { text, encoding } = decodeSubtitle(bytes)
  result.encoding = encoding
  const plainUtf8 = encoding === 'utf-8' && bytes[0] !== 0xef
  if (plainUtf8) return result

  const { mtimeMs } = await stat(file)
  const key = createHash('sha1').update(`${file}|${mtimeMs}`).digest('hex').slice(0, 16)
  await mkdir(cacheDir, { recursive: true })
  const converted = join(cacheDir, `${key}.${extension}`)
  await writeFile(converted, text, 'utf8')
  return { ...result, path: converted }
}

/**
 * Stažené titulky uložené v datech aplikace („<id>-Film.cs.srt“) – když do složky
 * s filmem nešlo zapisovat. Patří k videu podle názvu za číselnou předponou.
 */
export async function findDownloadedSubtitles(dir: string, videoPath: string): Promise<string[]> {
  const videoBase = basename(videoPath, extname(videoPath))
  return (await listDir(dir))
    .filter((entry) => !entry.isDir)
    .map((entry) => entry.name)
    .filter((name) => {
      const base = basename(name, extname(name)).replace(/^\d+-/, '')
      return subtitleMatchesVideo(videoBase, base)
    })
    .map((name) => join(dir, name))
    .sort()
}
