import { ipcMain, protocol } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { ActionResult } from '../../shared/metadata'
import type { ImageCache } from './ImageCache'
import type { MetadataService } from './MetadataService'

export const MEDIA_SCHEME = 'kinoteka-media'

/** Musí proběhnout před `app.whenReady()`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** kinoteka-media://tmdb/w500/abc.jpg → obrázek z cache (případně stažený z TMDB). */
export function handleMediaProtocol(images: ImageCache): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'tmdb') return new Response(null, { status: 404 })
    const image = await images.get(url.pathname)
    if (!image) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(image.data), {
      headers: { 'Content-Type': image.contentType, 'Cache-Control': 'max-age=31536000, immutable' }
    })
  })
}

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0
const fail = (error: unknown): ActionResult => ({ ok: false, message: (error as Error).message })

export function registerMetadataIpc(metadata: MetadataService): void {
  ipcMain.handle(IpcChannel.MetadataKeyStatus, () => metadata.keyStatus())
  ipcMain.handle(IpcChannel.MetadataSaveKey, (_event, key: unknown) =>
    typeof key === 'string' && key.length < 1024
      ? metadata.saveKey(key)
      : { ok: false, message: 'Neplatný klíč.' }
  )
  ipcMain.handle(IpcChannel.MetadataRemoveKey, () => metadata.removeKey())

  ipcMain.handle(IpcChannel.MetadataSearch, async (_event, input: unknown) => {
    const { kind, query, year } = (input ?? {}) as Record<string, unknown>
    if ((kind !== 'movie' && kind !== 'show') || typeof query !== 'string' || !query.trim())
      return []
    return metadata.search(
      kind,
      query.slice(0, 200),
      Number.isInteger(year) ? (year as number) : null
    )
  })

  ipcMain.handle(
    IpcChannel.MetadataApplyMatch,
    async (_event, titleId: unknown, tmdbId: unknown) => {
      if (!isId(titleId) || !isId(tmdbId)) return { ok: false, message: 'Neplatný výběr.' }
      try {
        await metadata.applyMatch(titleId, tmdbId)
        return { ok: true }
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(IpcChannel.MetadataRefresh, async (_event, titleId: unknown) => {
    if (isId(titleId)) await metadata.refresh(titleId)
  })
}
