import type { YtCategoryRole } from '../../shared/yt'
import { normalizeWords } from '../kids/classify'

/**
 * Zařazení videí z YouTube do kategorií podle obsahu (Města, Příroda…). Kategorie = podsložka
 * složky YT; její název a klíčová slova se hledají ve štítcích, názvu, popisu a kanálu videa.
 */

/** Údaje o videu z `.info.json` (yt-dlp). */
export interface YtMeta {
  title: string
  description: string | null
  tags: string[]
  channel: string | null
  /** Kategorie YouTube („Music“, „Travel & Events“). */
  categories: string[]
}

export interface CategoryKeywords {
  name: string
  keywords: string[]
  role: YtCategoryRole | null
}

/** Výchozí kategorie, které aplikace založí v prázdné složce (pořadí = pořadí na stránce). */
export const DEFAULT_CATEGORIES: readonly CategoryKeywords[] = [
  {
    name: 'Města',
    role: null,
    keywords: [
      'city',
      'cities',
      'town',
      'město',
      'města',
      'city walk',
      'walking tour',
      'walk',
      'downtown',
      'street',
      'streets',
      'skyline',
      'urban',
      'nightlife',
      'Praha',
      'Prague',
      'Brno',
      'Paris',
      'London',
      'Tokyo',
      'Kyoto',
      'Osaka',
      'New York',
      'NYC',
      'Los Angeles',
      'Las Vegas',
      'Chicago',
      'Miami',
      'San Francisco',
      'Berlin',
      'Munich',
      'Vienna',
      'Wien',
      'Rome',
      'Venice',
      'Milan',
      'Barcelona',
      'Madrid',
      'Lisbon',
      'Amsterdam',
      'Budapest',
      'Istanbul',
      'Dubai',
      'Seoul',
      'Hong Kong',
      'Singapore',
      'Bangkok',
      'Shanghai'
    ]
  },
  {
    name: 'Příroda',
    role: null,
    keywords: [
      'nature',
      'příroda',
      'forest',
      'les',
      'mountains',
      'mountain',
      'hory',
      'alps',
      'ocean',
      'sea',
      'moře',
      'lake',
      'jezero',
      'river',
      'waterfall',
      'beach',
      'island',
      'wildlife',
      'animals',
      'landscape',
      'scenery',
      'fjord',
      'fjords',
      'jungle',
      'rainforest',
      'desert',
      'drone',
      'aerial',
      'sunset',
      'sunrise'
    ]
  },
  {
    name: 'Koncerty a živě',
    role: null,
    keywords: [
      'live',
      'concert',
      'koncert',
      'festival',
      'unplugged',
      'live session',
      'live performance',
      'acoustic session',
      'tiny desk',
      'full concert',
      'tour'
    ]
  },
  { name: 'Hudební klipy', role: 'music', keywords: [] },
  { name: 'Ostatní', role: 'other', keywords: [] }
]

/** Výchozí klíčová slova a role pro kategorii podle názvu (i když složku založil uživatel). */
export function defaultsFor(name: string): Omit<CategoryKeywords, 'name'> | null {
  const key = normalizeWords(name)
  const found = DEFAULT_CATEGORIES.find((c) => normalizeWords(c.name) === key)
  return found ? { keywords: [...found.keywords], role: found.role } : null
}

/** Kde se klíčové slovo našlo – štítky a název nejvíc, popis (často plný odkazů) a kanál méně. */
const FIELD_WEIGHT = { tags: 4, title: 3, description: 2, channel: 1 } as const
/** Z popisu jen začátek – dál bývají odkazy, poděkování a seznamy skladeb. */
const DESCRIPTION_CHARS = 600
/**
 * Nejmenší součet vah pro zařazení: stačí štítek nebo název, ale jedno slovo jen v popisu
 * („live your best life“) nebo jen v kanálu nestačí.
 */
const MIN_SCORE = 3

const containsWords = (haystack: string, words: string): boolean =>
  words.length > 0 && ` ${haystack} `.includes(` ${words} `)

/** Je video podle YouTube hudba? */
export const isMusic = (meta: YtMeta): boolean =>
  meta.categories.some((c) => normalizeWords(c) === 'music')

/**
 * Kategorie podle obsahu, nebo null. Každé klíčové slovo (i název kategorie) přidá váhu pole,
 * ve kterém se našlo nejvýš; vyhraje kategorie s nejvyšším součtem (aspoň {@link MIN_SCORE}),
 * při shodě ta později založená (vlastní kategorie bývá konkrétnější než výchozí).
 * Záložní kategorie (hudba, ostatní) se tu nevybírají – ty určí {@link fallbackRole}.
 */
export function matchCategory(
  meta: YtMeta,
  categories: readonly CategoryKeywords[]
): string | null {
  const fields = [
    { weight: FIELD_WEIGHT.tags, text: meta.tags.map(normalizeWords).join(' | ') },
    { weight: FIELD_WEIGHT.title, text: normalizeWords(meta.title) },
    {
      weight: FIELD_WEIGHT.description,
      text: normalizeWords((meta.description ?? '').slice(0, DESCRIPTION_CHARS))
    },
    { weight: FIELD_WEIGHT.channel, text: normalizeWords(meta.channel ?? '') }
  ]
  let best: { name: string; score: number } | null = null
  for (const category of categories) {
    if (category.role) continue
    let score = 0
    for (const keyword of new Set([category.name, ...category.keywords].map(normalizeWords))) {
      const hit = fields.find((field) => containsWords(field.text, keyword))
      if (hit) score += hit.weight
    }
    if (score >= MIN_SCORE && (!best || score >= best.score)) best = { name: category.name, score }
  }
  return best?.name ?? null
}

/** Kam s videem, které žádné kategorii neodpovídá. */
export const fallbackRole = (meta: YtMeta): YtCategoryRole => (isMusic(meta) ? 'music' : 'other')

/** Údaje z `.info.json`; bez něj jen název (ze jména souboru). */
export function metaFromInfo(info: Record<string, unknown> | null, fallbackTitle: string): YtMeta {
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  return {
    title: text(info?.['title']) ?? fallbackTitle,
    description: text(info?.['description']),
    tags: list(info?.['tags']),
    channel: text(info?.['channel']) ?? text(info?.['uploader']),
    categories: list(info?.['categories'])
  }
}
