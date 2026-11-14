import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import type { UpdateState } from '../../../shared/update'

/** Stav aktualizací z hlavního procesu (načte se a pak se drží aktuální). */
export function useUpdateState(): UpdateState | null {
  const { update } = window.kinoteka
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    void update.state().then(setState)
    return update.onChanged(setState)
  }, [update])
  return state
}

/**
 * Pruh v dospělé části, když je nová verze stažená. „Později“ ho skryje – aktualizace se
 * pak nainstaluje sama při zavření Kinotéky. V dětském režimu se neukazuje.
 */
export default function UpdateBanner(): React.JSX.Element | null {
  const state = useUpdateState()
  const [hidden, setHidden] = useState<string | null>(null)
  if (state?.status !== 'ready' || !state.version || hidden === state.version) return null
  return (
    <div className="update-banner" role="status">
      <Download size={18} />
      <span>
        Je připravená nová verze Kinotéky <b>{state.version}</b>. Nainstaluje se při zavření, nebo
        hned teď.
      </span>
      <button className="btn sm primary" onClick={() => void window.kinoteka.update.install()}>
        Restartovat a nainstalovat
      </button>
      <button className="btn sm" title="Později" onClick={() => setHidden(state.version)}>
        <X size={16} /> Později
      </button>
    </div>
  )
}
