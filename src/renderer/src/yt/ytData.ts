import type { YtCategory, YtVideoSummary } from '../../../shared/yt'

/** Video s názvem kategorie, ve které je (karta v řadě Pokračovat). */
export interface YtCard extends YtVideoSummary {
  categoryName: string
}

/** Kategorie, které mají co ukázat (prázdné složky se na stránce nezobrazují). */
export const visibleCategories = (categories: readonly YtCategory[]): YtCategory[] =>
  categories.filter((category) => category.videos.length > 0)

/** Rozkoukaná videa, naposledy hraná první. */
export function continueRow(categories: readonly YtCategory[], limit = 20): YtCard[] {
  return categories
    .flatMap((category) =>
      category.videos
        .filter((video) => video.progress !== null)
        .map((video) => ({ ...video, categoryName: category.name }))
    )
    .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
    .slice(0, limit)
}

/** Klíč filtru v adrese: id kategorie, „ceka“ pro videa čekající na zařazení. */
export const filterKey = (category: YtCategory): string =>
  category.id === null ? 'ceka' : String(category.id)

export const totalVideos = (categories: readonly YtCategory[]): number =>
  categories.reduce((sum, category) => sum + category.videos.length, 0)

/** Kolik místa zabírají stažená videa (bajty). */
export const diskBytes = (categories: readonly YtCategory[]): number =>
  categories.reduce(
    (sum, category) => sum + category.videos.reduce((s, video) => s + video.sizeBytes, 0),
    0
  )

/** Kolik místa uvolní „Ponechat jen online“ u kategorie (stažená videa s odkazem na YouTube). */
export const freeableBytes = (category: YtCategory): number =>
  category.videos.reduce(
    (sum, video) => sum + (!video.online && video.youtubeId ? video.sizeBytes : 0),
    0
  )
