/**
 * Rozpoznání filmu nebo dílu seriálu z cesty k souboru.
 * Názvy bývají nejednotné („Vidím Vás (2022) S01E01 HD CZ Dabing!!!“, „Země gangů_S01E02_Puzzle“),
 * proto parser nejdřív najde označení dílu a rok a zbytek očistí od technických štítků.
 */

export interface ParsedName {
  kind: 'movie' | 'episode'
  /** Název filmu nebo seriálu tak, jak je v souboru (bez roku a štítků). */
  title: string
  /** Druhý název za pomlčkou, např. „The Watcher“ u „Vidim vas - The.Watcher.S01E03“. */
  alternativeTitle: string | null
  year: number | null
  season: number | null
  episode: number | null
  /** Poslední díl u souborů s více díly (S01E01E02). */
  episodeEnd: number | null
  episodeTitle: string | null
  /** Čitelné štítky: „CZ dabing“, „CZ titulky“, „1080p“, „5.1“, „WEBRip“… */
  tags: string[]
}

const L = '(?<![\\p{L}\\p{N}])'
const R = '(?![\\p{L}\\p{N}])'
const re = (source: string, flags = 'iu'): RegExp => new RegExp(source, flags)

const YEAR = re(`${L}(19\\d{2}|20\\d{2})${R}`, 'giu')

/** Složky, které nesou jen číslo série. */
const SEASON_FOLDER = [
  re(`^(?:season|série|serie|řada|rada|s)\\s?(\\d{1,2})$`),
  re(`^(\\d{1,2})\\.?\\s?(?:série|serie|řada|rada|season)$`)
]

/** Obecné složky, ze kterých se název seriálu brát nemá. */
const GENERIC_FOLDERS = new Set([
  'serialy',
  'seriály',
  'series',
  'tv',
  'tv shows',
  'shows',
  'filmy',
  'movies',
  'videa',
  'video'
])

interface EpisodeMatch {
  index: number
  length: number
  season: number | null
  episode: number
  episodeEnd: number | null
}

const EPISODE_PATTERNS: ((s: string) => EpisodeMatch | null)[] = [
  // S01E02, S1E2, S01 E02, S01E01E02, S01E01-E02, S01E01-02
  (s) => {
    const m = re(`${L}S(\\d{1,2})\\s?E(\\d{1,3})(?:-?E(\\d{1,3})|-(\\d{1,3}))?${R}`).exec(s)
    return m
      ? {
          index: m.index,
          length: m[0].length,
          season: Number(m[1]),
          episode: Number(m[2]),
          episodeEnd: m[3] || m[4] ? Number(m[3] ?? m[4]) : null
        }
      : null
  },
  // 1x02
  (s) => {
    const m = re(`${L}(\\d{1,2})x(\\d{2,3})${R}`).exec(s)
    return m
      ? {
          index: m.index,
          length: m[0].length,
          season: Number(m[1]),
          episode: Number(m[2]),
          episodeEnd: null
        }
      : null
  },
  // Série 1 Díl 3, Season 2 Episode 5
  (s) => {
    const m = re(
      `${L}(?:série|serie|season|řada|rada)\\s?(\\d{1,2})\\s?[,-]?\\s?(?:díl|dil|epizoda|episode|ep|e)\\.?\\s?(\\d{1,3})${R}`
    ).exec(s)
    return m
      ? {
          index: m.index,
          length: m[0].length,
          season: Number(m[1]),
          episode: Number(m[2]),
          episodeEnd: null
        }
      : null
  },
  // Díl 3, Epizoda 3, Ep. 3, Ep03
  (s) => {
    const m = re(`${L}(?:díl|dil|epizoda|episode|ep)\\.?\\s?(\\d{1,3})${R}`).exec(s)
    return m
      ? {
          index: m.index,
          length: m[0].length,
          season: null,
          episode: Number(m[1]),
          episodeEnd: null
        }
      : null
  },
  // E05 (jen velké E, aby se nechytala běžná slova)
  (s) => {
    const m = re(`${L}E(\\d{1,3})${R}`, 'u').exec(s)
    return m
      ? {
          index: m.index,
          length: m[0].length,
          season: null,
          episode: Number(m[1]),
          episodeEnd: null
        }
      : null
  }
]

type TagKind = 'resolution' | 'source' | 'codec' | 'audio' | 'language' | 'languageMode' | 'misc'

const TAG_RULES: [RegExp, TagKind, (token: string) => string | null][] = [
  [/^(2160p|4k|uhd)$/, 'resolution', () => '4K'],
  [/^(1080p|1080i|720p|576p|480p)$/, 'resolution', (t) => t],
  [/^(hd|fhd|fullhd|sd)$/, 'resolution', (t) => (t === 'sd' ? 'SD' : 'HD')],
  [
    /^(hdr|hdr10|hdr10\+|dv|dovi|sdr)$/,
    'resolution',
    (t) => (t === 'dv' || t === 'dovi' ? 'Dolby Vision' : t === 'sdr' ? null : 'HDR')
  ],
  [
    /^(webrip|web-?dl|web|bluray|blu-ray|bdrip|brrip|bdremux|remux|dvdrip|dvd|hdtv|hdrip|tvrip|webrip-?dl)$/,
    'source',
    (t) =>
      ({
        webrip: 'WEBRip',
        web: 'WEB',
        webdl: 'WEB-DL',
        'web-dl': 'WEB-DL',
        bluray: 'BluRay',
        'blu-ray': 'BluRay',
        remux: 'Remux',
        bdremux: 'Remux',
        dvdrip: 'DVDRip',
        dvd: 'DVD',
        hdtv: 'HDTV'
      })[t] ?? t.toUpperCase()
  ],
  [/^(x26[45]|h26[45]|hevc|avc|xvid|divx|10bit|8bit)$/, 'codec', () => null],
  [
    /^(\d\.\d|dd\+?\d\.\d|ddp\d\.\d|ac3|eac3|dts|dts-hd|dtshd|truehd|atmos|aac|mp3|flac)$/,
    'audio',
    (t) => {
      const channels = /(\d\.\d)$/.exec(t)
      if (channels) return channels[1]!
      return t === 'atmos' ? 'Atmos' : null
    }
  ],
  [
    /^(cz|cze|ces|czech|sk|svk|en|eng|multi|dual)$/,
    'language',
    (t) =>
      t.startsWith('cz') || t === 'ces'
        ? 'CZ'
        : t.startsWith('s')
          ? 'SK'
          : t.startsWith('e')
            ? 'EN'
            : 'MULTI'
  ],
  [
    /^(dabing|dab|dub|dubbing|titulky|titl|tit|sub|subs|forced)$/,
    'languageMode',
    (t) => (t.startsWith('d') ? 'dabing' : 'titulky')
  ],
  [/^(novinka|proper|repack|extended|uncut|remastered|internal|sample)$/, 'misc', () => null]
]

function classify(token: string): { kind: TagKind; label: string | null } | null {
  const clean = token
    .toLowerCase()
    .replace(/^[([{]+|[)\]}!?,;:]+$/g, '')
    .replace(/[!?]+/g, '')
  if (!clean) return null
  for (const [pattern, kind, label] of TAG_RULES) {
    if (pattern.test(clean)) return { kind, label: label(clean) }
  }
  return null
}

const isPunctuation = (token: string): boolean => /^[^\p{L}\p{N}]+$/u.test(token)

/** Tečky a podtržítka jako oddělovače slov; tečka v kanálech zvuku (5.1) zůstává. */
function cleanSeparators(value: string): string {
  return value
    .replace(/\bh\.26([45])\b/gi, 'H26$1')
    .replace(/(?<!\d)(\d)\.(\d)(?!\d)/g, '$1,$2')
    .replace(/[._]/g, ' ')
    .replace(/(?<!\d)(\d),(\d)(?!\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Extracted {
  text: string
  year: number | null
  tags: string[]
}

/**
 * Odstraní obsah hranatých a složených závorek, kulaté závorky s rokem nahradí rokem,
 * závorky jen se štítky („(cz titl)“) vyjme do štítků.
 */
function extractBrackets(value: string): { text: string; tagTokens: string[] } {
  const tagTokens: string[] = []
  const text = value
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/\(([^)]*)\)/g, (_match, inner: string) => {
      const content = inner.trim()
      if (/^(19|20)\d{2}$/.test(content)) return ` ${content} `
      const tokens = content.split(/[\s+]+/).filter(Boolean)
      if (tokens.length > 0 && tokens.every((t) => classify(t) || isPunctuation(t))) {
        tagTokens.push(...tokens)
        return ' '
      }
      return ` ${content} `
    })
  return { text: text.replace(/\s+/g, ' ').trim(), tagTokens }
}

/** Převede tokeny štítků na čitelné popisky („CZ“ + „dabing“ → „CZ dabing“). */
function labelTags(tokens: string[]): string[] {
  const labels: string[] = []
  const classified = tokens.map(classify)
  for (let i = 0; i < classified.length; i++) {
    const tag = classified[i]
    if (!tag?.label) continue
    if (tag.kind === 'language') {
      const next = classified[i + 1]
      if (next?.kind === 'languageMode' && next.label) {
        labels.push(`${tag.label} ${next.label}`)
        i++
        continue
      }
    }
    if (tag.kind === 'languageMode') {
      const previous = classified[i - 1]
      // „dabing“ bez jazyka – u českých souborů jde prakticky vždy o český dabing.
      labels.push(previous?.kind === 'language' ? tag.label : `CZ ${tag.label}`)
      continue
    }
    labels.push(tag.label)
  }
  return [...new Set(labels)]
}

/**
 * Z části názvu vezme text až po rok nebo první štítek. Rok se hledá poslední
 * (ne na začátku), aby „2001 Vesmírná odysea (1968)“ dalo název „2001 Vesmírná odysea“.
 */
function splitTitleAndTags(part: string, findYear: boolean): Extracted {
  let year: number | null = null
  let text = part
  let trailing: string[] = []
  if (findYear) {
    const last = [...text.matchAll(YEAR)].filter((m) => m.index > 0).at(-1)
    if (last) {
      year = Number(last[1])
      trailing = tokensOf(text.slice(last.index + last[0].length))
      text = text.slice(0, last.index)
    }
  }
  const tokens = tokensOf(text)
  const firstTag = tokens.findIndex((token) => classify(token) !== null)
  const titleTokens = firstTag === -1 ? tokens : tokens.slice(0, firstTag)
  const tagTokens = firstTag === -1 ? [] : tokens.slice(firstTag)
  return { text: trimTitle(titleTokens.join(' ')), year, tags: [...tagTokens, ...trailing] }
}

const tokensOf = (text: string): string[] => text.split(' ').filter(Boolean)

function trimTitle(text: string): string {
  return text
    .replace(/^[\s\-–—:,.]+|[\s\-–—:,.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function capitalize(text: string): string {
  return text && text === text.toLowerCase() ? text[0]!.toUpperCase() + text.slice(1) : text
}

function seasonFromFolder(name: string): number | null {
  for (const pattern of SEASON_FOLDER) {
    const m = pattern.exec(name.trim())
    if (m) return Number(m[1])
  }
  return null
}

/** Rozdělí „Vidim vas - The Watcher“ na hlavní a alternativní název. */
function splitAlternative(title: string): [string, string | null] {
  const parts = title.split(/\s[-–—]\s/)
  if (parts.length < 2) return [title, null]
  return [trimTitle(parts[0]!), trimTitle(parts.slice(1).join(' - ')) || null]
}

/** @param relativePath cesta vůči složce knihovny (oddělovač \ nebo /) */
export function parseMediaPath(relativePath: string): ParsedName {
  const segments = relativePath.split(/[\\/]/).filter(Boolean)
  const fileName = segments.pop() ?? ''
  const baseName = fileName.replace(/\.[^.]+$/, '')

  // Kontext ze složek: číslo série a název seriálu (nejbližší složka, která není „Série 1“).
  let folderSeason: number | null = null
  let folderTitle: string | null = null
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!
    const season = seasonFromFolder(cleanSeparators(segment))
    if (season !== null) {
      folderSeason ??= season
      continue
    }
    if (!GENERIC_FOLDERS.has(segment.toLowerCase())) {
      folderTitle = segment
      break
    }
  }

  const { text, tagTokens } = extractBrackets(cleanSeparators(baseName))

  let match: EpisodeMatch | null = null
  for (const pattern of EPISODE_PATTERNS) {
    match = pattern(text)
    if (match) break
  }
  // „01 - Pilot.mkv“ ve složce „Série 1“
  if (!match && folderSeason !== null) {
    const m = /^(\d{1,3})(?=\s|$)/.exec(text)
    if (m)
      match = {
        index: 0,
        length: m[0].length,
        season: null,
        episode: Number(m[1]),
        episodeEnd: null
      }
  }

  if (!match) {
    const movie = splitTitleAndTags(text, true)
    // Celý název je jen rok (např. „1917“) – pak je to název, ne rok.
    const title = movie.text || (text.match(YEAR)?.[0] ?? text)
    return {
      kind: 'movie',
      title: capitalize(title),
      alternativeTitle: null,
      year: movie.text ? movie.year : null,
      season: null,
      episode: null,
      episodeEnd: null,
      episodeTitle: null,
      tags: labelTags([...movie.tags, ...tagTokens])
    }
  }

  const before = splitTitleAndTags(text.slice(0, match.index), true)
  const after = splitTitleAndTags(text.slice(match.index + match.length), true)

  let title = before.text
  if (!title && folderTitle)
    title = splitTitleAndTags(extractBrackets(cleanSeparators(folderTitle)).text, true).text
  const [primary, alternative] = splitAlternative(title)

  return {
    kind: 'episode',
    title: capitalize(primary),
    alternativeTitle: alternative,
    year: before.year ?? after.year,
    season: match.season ?? folderSeason ?? 1,
    episode: match.episode,
    episodeEnd: match.episodeEnd,
    episodeTitle: after.text ? capitalize(after.text) : null,
    tags: labelTags([...before.tags, ...after.tags, ...tagTokens])
  }
}

/** Klíč pro porovnání názvů: bez diakritiky, malými písmeny, jen písmena a číslice. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' a ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
