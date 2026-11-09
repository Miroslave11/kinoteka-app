import { useEffect, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { haBulbState, haLabel, type HaStatus } from '../../../shared/ha'

/** Živý stav Home Assistant (mění se z hlavního procesu). */
export function useHaStatus(): HaStatus | null {
  const [status, setStatus] = useState<HaStatus | null>(null)
  useEffect(() => {
    const { ha } = window.kinoteka
    let active = true
    void ha.status().then((next) => active && setStatus(next))
    const off = ha.onChanged(setStatus)
    return () => {
      active = false
      off()
    }
  }, [])
  return status
}

/** Klávesa L (bez Ctrl / Alt / Win) mimo textová pole. */
export function isHaToggleKey(event: KeyboardEvent): boolean {
  if (event.key !== 'l' && event.key !== 'L') return false
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return false
  const target = event.target as HTMLElement | null
  if (!target) return true
  const tag = target.tagName
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
}

export function toggleHa(): void {
  void window.kinoteka.ha.toggle()
}

/**
 * Žárovka bez textu: žlutá = zapnuto, šedá = vypnuto, čárkovaná = Home Assistant nedostupný.
 * Klik přepne entitu; název je jen v bublině.
 */
export default function HaBulb({
  status,
  className
}: {
  status: HaStatus | null
  className: string
}): React.JSX.Element | null {
  const bulb = haBulbState(status)
  if (bulb === 'hidden') return null
  const label = haLabel(status)
  const title =
    status?.connection === 'connected' && status.entity?.missing
      ? `${label} – entita v Home Assistant není, vyber ji znovu v Nastavení`
      : bulb === 'unavailable'
        ? `${label} – Home Assistant nedostupný${status?.error ? `: ${status.error}` : ''}`
        : `${label} – ${bulb === 'on' ? 'vypnout' : 'zapnout'} (L)`
  return (
    <button
      className={`${className} ha-bulb is-${bulb}`}
      title={title}
      aria-label={title}
      aria-pressed={bulb === 'on'}
      onClick={toggleHa}
    >
      <Lightbulb size={18} fill={bulb === 'on' ? 'currentColor' : 'none'} />
    </button>
  )
}
