import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** Krátké čekání (přetočení v souboru na disku) se neukazuje – kolečko by jen problikla. */
const SHOW_AFTER_MS = 300

/**
 * Kolečko s textem uprostřed obrazu, když přehrávač čeká (načítá video, přetáčí, čeká
 * na data z YouTube). Kliknutí propouští – ovládání pod ním dál funguje.
 */
export default function BusyIndicator({ text }: { text: string | null }): React.JSX.Element | null {
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!text) {
      setShown(null)
      return
    }
    const timer = window.setTimeout(() => setShown(text), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [text])
  if (!shown) return null
  return (
    <div className="busy" role="status" aria-live="polite">
      <Loader2 size={40} className="busy-spin" />
      <span>{shown}</span>
    </div>
  )
}
