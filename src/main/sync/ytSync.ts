import type { Database } from '../db/database'
import type { SyncAdapter, SyncEntity } from './syncModel'

/**
 * Sdílení YT videí: kategorie (název, klíčová slova) a videa s ID z YouTube (název, kanál,
 * délka, kategorie). Jestli je video v počítači stažené, nebo jen online, je věc každého PC –
 * na druhém počítači se chybějící video objeví jako online. Rozkoukání se nesdílí.
 * Videa bez ID z YouTube (vlastní klipy) a videa čekající na zařazení se nesdílí.
 */

export const YT_CATEGORY_PREFIX = 'yt-kategorie:'
export const YT_VIDEO_PREFIX = 'yt-video:'

export interface YtCategoryData {
  name: string
  keywords: string[]
}

export interface YtVideoData {
  youtubeId: string
  name: string
  channel: string | null
  durationSec: number | null
  category: string
}

/** Co adaptér potřebuje od knihovny YT videí (YtLibrary). */
export interface YtSyncTarget {
  syncCategory(name: string, keywords: readonly string[]): Promise<void>
  syncDeleteCategory(name: string): Promise<void>
  syncVideo(video: YtVideoData): Promise<void>
  syncDeleteVideo(youtubeId: string): Promise<void>
  scan(): Promise<unknown>
}

function parseList(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? '[]'))
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

/** Kategorie se pozná podle názvu složky bez ohledu na velikost písmen. */
const categoryKey = (name: string): string => `${YT_CATEGORY_PREFIX}${name.toLowerCase()}`

export function ytCategoryAdapter(db: Database, target: YtSyncTarget): SyncAdapter {
  return {
    prefix: YT_CATEGORY_PREFIX,
    snapshot: () =>
      new Map(
        db
          .prepare('SELECT folder, keywords FROM yt_category')
          .all()
          .map((row): [string, YtCategoryData] => [
            categoryKey(String(row['folder'])),
            { name: String(row['folder']), keywords: parseList(row['keywords']) }
          ])
      ),
    // Nové kategorie první (videa do nich se přesouvají), smazání až po přesunech videí.
    rank: (entity) => (entity.deleted ? 3 : 0),
    apply: async (entity: SyncEntity) => {
      const data = entity.data as YtCategoryData
      if (entity.deleted) await target.syncDeleteCategory(data.name)
      else await target.syncCategory(data.name, data.keywords)
    }
  }
}

export function ytVideoAdapter(db: Database, target: YtSyncTarget): SyncAdapter {
  return {
    prefix: YT_VIDEO_PREFIX,
    snapshot: () => {
      const videos = new Map<string, YtVideoData>()
      const rows = db
        .prepare(
          `SELECT v.youtube_id, v.name, v.channel, v.duration, c.folder
           FROM yt_video v JOIN yt_category c ON c.id = v.category_id
           WHERE v.youtube_id IS NOT NULL
           ORDER BY v.id`
        )
        .all()
      for (const row of rows) {
        const youtubeId = String(row['youtube_id'])
        // Stejné video dvakrát (staženo i odkaz) – stačí jednou.
        if (videos.has(`${YT_VIDEO_PREFIX}${youtubeId}`)) continue
        videos.set(`${YT_VIDEO_PREFIX}${youtubeId}`, {
          youtubeId,
          name: String(row['name']),
          channel: (row['channel'] as string | null) ?? null,
          durationSec: typeof row['duration'] === 'number' ? Math.round(row['duration']) : null,
          category: String(row['folder'])
        })
      }
      return videos
    },
    rank: (entity) => (entity.deleted ? 1 : 2),
    apply: async (entity: SyncEntity) => {
      const data = entity.data as YtVideoData
      if (entity.deleted) await target.syncDeleteVideo(data.youtubeId)
      else await target.syncVideo(data)
    },
    // Nová online videa načte do knihovny jeden sken složky.
    afterApply: async () => {
      await target.scan()
    }
  }
}
