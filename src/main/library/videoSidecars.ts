import { existsSync } from 'node:fs'
import { mkdir, readFile, rename } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

/**
 * Soubory, které leží vedle videa staženého yt-dlp (`.info.json`, obrázek, titulky), a jejich
 * přesun spolu s videem. Společné pro složku Děti a YT videa.
 */

/** Rozpracované soubory yt-dlp: „x.f398.mp4“ (obraz bez zvuku), „x.temp.mp4“ (spojování). */
export const PARTIAL_DOWNLOAD = /\.(f\d+|temp|part)\.[^.]+$/i

const IMAGE_EXTENSIONS = ['.jpg', '.webp', '.png']

export const withoutExtension = (path: string): string =>
  path.slice(0, path.length - extname(path).length)

/** YouTube ID ze jména souboru yt-dlp: „Název [dQw4w9WgXcQ].mp4“. */
export function nameAndYoutubeId(path: string): { name: string; youtubeId: string | null } {
  const base = basename(withoutExtension(path))
  const match = /^(.*?)\s*\[([\w-]{11})\]$/.exec(base)
  return match ? { name: match[1] || base, youtubeId: match[2]! } : { name: base, youtubeId: null }
}

/** Cesta k `.info.json` vedle videa (nemusí existovat). */
export const infoJsonPath = (path: string): string => `${withoutExtension(path)}.info.json`

/** Obsah `.info.json` vedle videa; null = není nebo je poškozený. */
export async function readInfoJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(infoJsonPath(path), 'utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Obrázek se stejným jménem jako video (náhled z YouTube). */
export function findSidecarImage(path: string): string | null {
  const base = withoutExtension(path)
  return IMAGE_EXTENSIONS.map((ext) => base + ext).find((image) => existsSync(image)) ?? null
}

/** Online YT video: soubor s odkazem místo videa (`Název [ID].ytonline`). */
export const ONLINE_EXTENSION = '.ytonline'

export const isOnlineFile = (path: string): boolean => path.toLowerCase().endsWith(ONLINE_EXTENSION)

/** Neprázdný text z `.info.json`. */
export const infoText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** Přesune video i soubory se stejným začátkem jména (obrázek, údaje, titulky). */
export async function moveWithSidecars(
  path: string,
  siblings: readonly string[],
  targetDir: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  const base = basename(withoutExtension(path))
  const related = siblings.filter((name) => name === basename(path) || name.startsWith(`${base}.`))
  if (related.some((name) => existsSync(join(targetDir, name))))
    throw new Error('V cílové složce už stejný soubor je.')
  // Video poslední – kdyby se přesun přerušil, zůstane na místě a zkusí se znovu.
  const ordered = [...related.filter((n) => n !== basename(path)), basename(path)]
  for (const name of ordered) await rename(join(dirname(path), name), join(targetDir, name))
}
