/** Text pro vyhledávání: bez diakritiky a malými písmeny („Země“ najde i „zeme“). */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
