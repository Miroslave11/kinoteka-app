/** Český tvar podle počtu: 1 film, 2–4 filmy, 0 a 5+ filmů. */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count)
  if (n === 1) return one
  if (n >= 2 && n <= 4) return few
  return many
}

/** „3 filmy“ – počet i se slovem. */
export const countOf = (count: number, one: string, few: string, many: string): string =>
  `${count.toLocaleString('cs-CZ')} ${plural(count, one, few, many)}`
