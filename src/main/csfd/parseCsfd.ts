/**
 * Údaje o filmu ze stránky ČSFD. Vychází z ověřeného parseru aplikace web-library
 * (třídy film-header-name, genres, origin, plot-full…), navíc čte JSON-LD, kde je
 * přesné hodnocení, počet hodnocení, délka a tvůrci.
 */
import type { CsfdData } from '../../shared/csfd'
import { parseCsfdUrl } from '../../shared/csfd'

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…'
}

/** Text bez značek HTML, jednou mezerou. */
export function plain(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1] === 'x' || entity[1] === 'X'
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1))
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : all
      }
      return ENTITIES[entity.toLowerCase()] ?? all
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** Obsah prvku s třídou `cls` (první výskyt; vnořené prvky stejného typu se počítají). */
function block(html: string, cls: string, tag = 'div'): string {
  const start = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'i').exec(html)
  if (!start) return ''
  let depth = 1
  const open = new RegExp(`<${tag}\\b`, 'gi')
  const close = new RegExp(`</${tag}>`, 'gi')
  let pos = start.index + start[0].length
  while (depth > 0) {
    open.lastIndex = pos
    close.lastIndex = pos
    const o = open.exec(html)
    const c = close.exec(html)
    if (!c) return html.slice(start.index + start[0].length)
    if (o && o.index < c.index) {
      depth++
      pos = o.index + 1
    } else {
      depth--
      pos = c.index + c[0].length
      if (depth === 0) return html.slice(start.index + start[0].length, c.index)
    }
  }
  return ''
}

const links = (html: string): string[] =>
  [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => plain(m[1]!))
    .filter((text) => text && !/^(více|další|\.\.\.)$/i.test(text))

type Json = Record<string, unknown>

function jsonLd(html: string): Json {
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const data = JSON.parse(match[1]!) as Json
      if (/Movie|TVSeries|CreativeWork/i.test(String(data['@type']))) return data
    } catch {
      // poškozený JSON-LD – zkusí se další, případně zůstanou údaje z HTML
    }
  }
  return {}
}

const names = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .map((person) =>
      typeof person === 'object' && person ? String((person as Json)['name'] ?? '') : ''
    )
    .filter(Boolean)

/** „PT1H50M“ / „PT110M“ → minuty. */
function isoMinutes(value: unknown): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?/.exec(String(value ?? ''))
  if (!match || (!match[1] && !match[2])) return null
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)
}

/** Údaje o filmu ze stránky ČSFD; null, když to stránka filmu není (nebo ČSFD změnilo vzhled). */
export function parseCsfd(html: string, fallbackUrl?: string): CsfdData | null {
  const header = block(html, 'film-header-name')
  const ld = jsonLd(html)
  const name =
    plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(header)?.[1] ?? '') || String(ld['name'] ?? '')
  if (!name) return null

  const url =
    /<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i.exec(html)?.[1] ??
    /property="og:url"[^>]*content="([^"]+)"/i.exec(html)?.[1] ??
    fallbackUrl ??
    ''
  const id = parseCsfdUrl(url)
  if (!id) return null

  // Původní název: první položka seznamu názvů (s vlajkou), bez „více“.
  const firstName =
    /<li\b[^>]*>([\s\S]*?)<\/li>/i.exec(block(header, 'film-names', 'ul'))?.[1] ?? ''
  const original = plain(firstName.replace(/<span\b[\s\S]*$/i, ''))

  const aggregate = (ld['aggregateRating'] ?? {}) as Json
  const ldRating = Number(aggregate['ratingValue'])
  const htmlRating = /^(\d{1,3})\s*%/.exec(plain(block(html, 'film-rating-average')))?.[1]
  const rating = Number.isFinite(ldRating)
    ? Math.round(ldRating)
    : htmlRating
      ? Number(htmlRating)
      : null
  const ratingCount = Number(aggregate['ratingCount'])

  // „USA / Velká Británie (2023–2026) 11 h 38 min“ nebo „Francie / Itálie 2003 85 min“
  const originText = plain(block(html, 'origin'))
  const year =
    Number(/\b(1[89]\d{2}|20\d{2})\b/.exec(originText)?.[1] ?? ld['dateCreated'] ?? 0) || null
  const total = originText.replace(/\(Minutáž:[^)]*\)/i, '')
  const hours = /(\d+)\s*h\b/.exec(total)?.[1]
  const minutes = /(\d+)\s*min\b/.exec(total)?.[1]
  const htmlMinutes = Number(hours ?? 0) * 60 + Number(minutes ?? 0)
  const countries = (originText.split(/\(|\b(?:1[89]\d{2}|20\d{2})\b/)[0] ?? '')
    .split(/\s*[/,]\s*/)
    .map((country) => country.trim())
    .filter((country) => country && !/^\d/.test(country))

  const plotHtml = block(html, 'plot-full') || block(html, 'plot-preview')
  const plot = plain(
    plotHtml
      .replace(/<em\b[^>]*class="[^"]*span-more[\s\S]*$/i, '')
      .replace(/<span\b[^>]*class="[^"]*(source|more)[\s\S]*$/i, '')
  )

  return {
    id,
    url: `https://www.csfd.cz/film/${id}/prehled/`,
    name,
    originalName: original && original !== name ? original : null,
    year,
    rating,
    ratingCount: Number.isFinite(ratingCount) ? ratingCount : null,
    genres: links(block(html, 'genres')),
    countries,
    runtimeMin: htmlMinutes || isoMinutes(ld['duration']),
    directors: names(ld['director']).slice(0, 6),
    actors: names(ld['actor']).slice(0, 10),
    plot: plot ? plot.slice(0, 2000) : null,
    series: /\((seriál|série)\)/i.test(plain(header)) || ld['@type'] === 'TVSeries'
  }
}
