/** ISO 639-2 (jak je píší kontejnery) → ISO 639-1. */
const TO_ISO1: Record<string, string> = {
  cze: 'cs',
  ces: 'cs',
  cs: 'cs',
  slo: 'sk',
  slk: 'sk',
  sk: 'sk',
  eng: 'en',
  en: 'en',
  ger: 'de',
  deu: 'de',
  de: 'de',
  fre: 'fr',
  fra: 'fr',
  fr: 'fr',
  spa: 'es',
  es: 'es',
  ita: 'it',
  it: 'it',
  pol: 'pl',
  pl: 'pl',
  rus: 'ru',
  ru: 'ru',
  hun: 'hu',
  hu: 'hu',
  jpn: 'ja',
  ja: 'ja',
  kor: 'ko',
  ko: 'ko',
  chi: 'zh',
  zho: 'zh',
  zh: 'zh',
  ukr: 'uk',
  uk: 'uk',
  dut: 'nl',
  nld: 'nl',
  nl: 'nl',
  swe: 'sv',
  sv: 'sv',
  por: 'pt',
  pt: 'pt'
}

/** Normalizuje kód jazyka; neznámý nebo „und“ → null. */
export function normalizeLanguage(code: unknown): string | null {
  if (typeof code !== 'string') return null
  const key = code.trim().toLowerCase()
  if (!key || key === 'und' || key === 'mul' || key === 'zxx') return null
  return TO_ISO1[key] ?? key
}

const displayNames = new Intl.DisplayNames(['cs'], { type: 'language' })

/** „cs“ → „čeština“. */
export function languageName(code: string | null): string {
  if (!code) return 'neznámý jazyk'
  try {
    return displayNames.of(code) ?? code
  } catch {
    return code
  }
}
