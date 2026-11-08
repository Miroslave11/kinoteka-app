import { canResume } from '../../shared/playback'
import { isOnlineFile } from '../library/videoSidecars'
import type { YtRepository } from './YtRepository'

/** Co potřebuje přehrávač k YT videu: soubor, název, odkud začít, sousedé v kategorii. */
export interface YtPlayItem {
  videoId: number
  path: string
  title: string
  /** Online video: YouTube ID, ze kterého se přehrává (soubor na disku je jen odkaz). */
  online: string | null
  /** Rozkoukané video pokračuje samo (u krátkých klipů se nemá smysl ptát). */
  startSec?: number
  previous: { id: number; name: string } | null
  next: { id: number; name: string } | null
}

export function ytPlayItem(
  repository: Pick<YtRepository, 'queue' | 'progress'>,
  videoId: number
): YtPlayItem | null {
  const queue = repository.queue(videoId)
  const index = queue.findIndex((video) => video.id === videoId)
  const current = queue[index]
  if (!current) return null
  const progress = repository.progress(videoId)
  const neighbour = (video: (typeof queue)[number] | undefined) =>
    video ? { id: video.id, name: video.name } : null
  return {
    videoId,
    path: current.path,
    title: current.name,
    online: isOnlineFile(current.path) ? current.youtubeId : null,
    startSec: canResume(progress) ? progress.position : undefined,
    previous: neighbour(queue[index - 1]),
    next: neighbour(queue[index + 1])
  }
}
