/** Stav automatických aktualizací pro okno (Nastavení → O aplikaci a pruh nahoře). */
export interface UpdateState {
  /**
   * unsupported = vývojová verze (aktualizace jen v nainstalované aplikaci), idle = ještě
   * nezkontrolováno, latest = nejnovější verze, ready = nová verze stažená, čeká na instalaci.
   */
  status: 'unsupported' | 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error'
  /** Nová verze (při stahování a když je připravená). */
  version: string | null
  /** Průběh stahování 0–100. */
  percent: number | null
  message: string | null
  /** Kontrolovat automaticky po startu a každých 6 hodin. */
  autoCheck: boolean
  /** Klíč, kterým aplikace čte soukromý repozitář s vydáními. */
  key: UpdateKey
}

/**
 * Klíč pro aktualizace: none = aplikace ho nemá (vývojová verze), ok = platí, invalid =
 * neplatný nebo vypršelý, unknown = zatím neověřeno (bez internetu).
 */
export interface UpdateKey {
  status: 'none' | 'ok' | 'invalid' | 'unknown'
  /** Do kdy klíč platí (ISO); null = neznámo nebo bez vypršení. */
  expiresAt: string | null
}

/** Kolik dní před vypršením klíče se ukazuje upozornění. */
export const KEY_WARNING_DAYS = 30

/** Vyprší klíč do 30 dní (nebo už vypršel)? */
export function keyExpiresSoon(key: UpdateKey, now = new Date()): boolean {
  if (key.status !== 'ok' || !key.expiresAt) return false
  return new Date(key.expiresAt).getTime() - now.getTime() < KEY_WARNING_DAYS * 24 * 60 * 60 * 1000
}

/** Upozornění na klíč pro aktualizace (O aplikaci, pruh nahoře); null = vše v pořádku. */
export function keyWarning(key: UpdateKey, now = new Date()): string | null {
  if (key.status === 'invalid')
    return 'Klíč pro aktualizace je neplatný nebo vypršel. Kinotéka novou verzi sama nenajde – stáhni ji ručně z GitHubu (kinoteka-vydani).'
  if (!keyExpiresSoon(key, now)) return null
  return `Klíč pro aktualizace vyprší ${new Date(key.expiresAt!).toLocaleDateString('cs-CZ')}. Před tím je potřeba vydat a nainstalovat verzi s novým klíčem, jinak se Kinotéka přestane aktualizovat.`
}
