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
}
