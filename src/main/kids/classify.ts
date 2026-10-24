/**
 * Zařazení dětských videí do titulů (Prasátko Peppa, Tlapková patrola…) podle údajů z YouTube.
 * Titul = podsložka ve složce Kids; jeho klíčová slova se hledají v sérii, playlistu, kanálu
 * a názvu videa.
 */

/** Údaje o videu z `.info.json` (yt-dlp); u videí bez údajů jen název souboru. */
export interface VideoMeta {
  title: string
  channel: string | null
  playlist: string | null
  series: string | null
}

export interface TitleKeywords {
  name: string
  keywords: string[]
}

/** Bez diakritiky, malými písmeny, jen písmena a číslice oddělené mezerou. */
export function normalizeWords(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const containsWords = (haystack: string, words: string): boolean =>
  words.length > 0 && ` ${haystack} `.includes(` ${words} `)

/** Kde se klíčové slovo našlo – série a playlist jsou nejspolehlivější, název videa nejméně. */
const FIELD_WEIGHT = { series: 4, playlist: 3, channel: 2, title: 1 } as const

/**
 * Existující titul, kam video patří, nebo null. Při více shodách vyhraje shoda v důležitějším
 * poli (kanál „PAW Patrol“ má přednost před slovem „Peppa“ v názvu videa), pak delší slovo.
 */
export function matchTitle(meta: VideoMeta, titles: readonly TitleKeywords[]): string | null {
  const fields = (Object.keys(FIELD_WEIGHT) as (keyof typeof FIELD_WEIGHT)[]).map((field) => ({
    weight: FIELD_WEIGHT[field],
    text: normalizeWords(meta[field] ?? '')
  }))
  let best: { name: string; score: number } | null = null
  for (const title of titles) {
    for (const keyword of new Set([title.name, ...title.keywords].map(normalizeWords))) {
      for (const field of fields) {
        if (!containsWords(field.text, keyword)) continue
        const score = field.weight * 1000 + keyword.length
        if (!best || score > best.score) best = { name: title.name, score }
      }
    }
  }
  return best?.name ?? null
}

/** Obecná slova kanálů a playlistů (bez diakritiky), která do názvu titulu nepatří. */
const FILLER = new Set(
  (
    'official oficialni channel kanal full episode episodes cele cely dily dil epizody ' +
    'compilation kompilace cesky cesku cz sk tv kids deti karikatury cartoon cartoons ' +
    'pohadky pohadka kreslene kreslena animated'
  ).split(' ')
)
/** Spojky, které samy o sobě nic neznamenají („pro děti“, „for kids“). */
const CONNECTIVES = new Set(['a', 'i', 'and', 'the', 'pro', 'for', 'po', 'na', 's', 'with'])

const isFiller = (word: string): boolean => {
  const normalized = normalizeWords(word)
  return FILLER.has(normalized) || CONNECTIVES.has(normalized) || normalized === ''
}

/** Emoji, hashtagy a oddělovače kolem názvu. */
const DECORATION = /\p{Extended_Pictographic}|️|#\S+/gu
/** Svislá čára a tečka kdekoli, pomlčka jen s mezerami (ne „Spider-Man“), dvojtečka před mezerou. */
const SEPARATOR = /\s*[|｜·•]\s*|\s+[-–—]\s+|:\s+/

/**
 * „Prasátko Peppa - Oficiální kanál“ → „Prasátko Peppa“. Části oddělené pomlčkou či svislou
 * čarou, které obsahují jen obecná slova, zahodí; zůstane-li nic, vrátí původní text.
 */
export function cleanShowName(text: string): string {
  const parts = text
    .replace(DECORATION, ' ')
    .split(SEPARATOR)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  // Z každé části se odeberou obecná slova a spojky na okrajích; část jen z nich
  // („Oficiální kanál“) zmizí celá.
  const kept = parts
    .map((part) => {
      const words = part.split(' ').filter((word) => !FILLER.has(normalizeWords(word)))
      while (words.length > 0 && isFiller(words[0]!)) words.shift()
      while (words.length > 0 && isFiller(words.at(-1)!)) words.pop()
      return words.join(' ')
    })
    .filter(Boolean)
  return kept[0] ?? text.replace(DECORATION, ' ').replace(/\s+/g, ' ').trim()
}

/** Název nového titulu pro video, které nepatří k žádnému existujícímu: série, playlist, kanál. */
export function deriveTitleName(meta: VideoMeta): string | null {
  for (const source of [meta.series, meta.playlist, meta.channel]) {
    const name = source && cleanShowName(source)
    if (name) return name
  }
  return null
}

/**
 * Název dílu bez názvu pořadu a obecných dovětků:
 * „🎁 Santova návštěva! | Prasátko Peppa | Karikatury pro děti“ → „Santova návštěva!“.
 */
export function cleanVideoName(title: string, show: TitleKeywords | null): string {
  const keywords = show ? [show.name, ...show.keywords].map(normalizeWords).filter(Boolean) : []
  const parts = title
    .replace(DECORATION, ' ')
    .split(/\s*[|｜•]\s*|\s+[-–—]\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const kept = parts.filter((part) => {
    const text = normalizeWords(part)
    if (keywords.some((keyword) => text === keyword)) return false
    // Část jen z obecných slov („Karikatury pro děti“, „Full Episodes“).
    return !text.split(' ').every(isFiller)
  })
  return kept.join(' – ') || title.replace(DECORATION, ' ').replace(/\s+/g, ' ').trim()
}

/** Název podsložky pro titul – bez znaků, které Windows v názvech nedovolí. */
export function safeFolderName(name: string): string {
  const safe = Array.from(name, (char) => (char < ' ' ? ' ' : char))
    .join('')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
    .trim()
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe) || !safe ? 'Ostatní' : safe
}
