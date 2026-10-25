import { useEffect, useState } from 'react'
import { Download, KeyRound, X } from 'lucide-react'
import { keyWarning, type UpdateState } from '../../../shared/update'

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
 * Bez připravené verze upozorní na klíč pro aktualizace, který brzy vyprší (do zavření).
 */
export default function UpdateBanner(): React.JSX.Element | null {
  const state = useUpdateState()
  const [hidden, setHidden] = useState<string | null>(null)
  const warning = state && keyWarning(state.key)
  if (state?.status !== 'ready' && warning && hidden !== 'key') {
    return (
      <div className="update-banner" role="status">
        <KeyRound size={18} />
        <span>{warning}</span>
        <button className="btn sm" title="Skrýt" onClick={() => setHidden('key')}>
          <X size={16} /> Rozumím
        </button>
      </div>
    )
  }
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
