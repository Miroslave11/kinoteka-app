import { useEffect, useState } from 'react'
import { Check, Delete, Lock } from 'lucide-react'
import type { KidsChallenge } from '../../../shared/kids'

/**
 * Rodičovská brána: PIN, nebo příklad pro dospělé (když PIN není nastavený).
 * Číselník je velký, ale bez nápovědy – dítě nemá jak uhodnout.
 */
export default function KidsGate({
  onPass,
  onCancel
}: {
  onPass: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { kids } = window.kinoteka
  const [challenge, setChallenge] = useState<KidsChallenge | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => void kids.challenge().then(setChallenge), [kids])

  const submit = async (): Promise<void> => {
    if (!value || busy) return
    setBusy(true)
    const result = await kids.unlock(value)
    setBusy(false)
    if (result.ok) return onPass()
    setValue('')
    setError(result.message)
    // Po chybném příkladu nový příklad (aby se nedal zkoušet donekonečna stejný).
    if (challenge?.kind === 'math') setChallenge(await kids.challenge())
  }

  const press = (key: string): void => {
    setError(null)
    if (key === 'back') setValue((v) => v.slice(0, -1))
    else if (key === 'ok') void submit()
    else setValue((v) => (v.length < 8 ? v + key : v))
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (/^\d$/.test(event.key)) press(event.key)
      else if (event.key === 'Backspace') press('back')
      else if (event.key === 'Enter') press('ok')
      else if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pin = challenge?.kind === 'pin'

  return (
    <div className="k-dim" onClick={onCancel}>
      <div
        className="k-gate"
        role="dialog"
        aria-label="Pro rodiče"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="k-gate-lock">
          <Lock size={38} strokeWidth={2.4} />
        </div>
        <h2>Pro rodiče</h2>
        <p>{pin ? 'Zadej PIN' : (challenge?.question ?? '…')}</p>
        <div className="k-gate-value">
          {pin ? (
            Array.from({ length: Math.max(4, value.length) }, (_, i) => (
              <i key={i} className={i < value.length ? 'f' : ''} />
            ))
          ) : (
            <span>{value || ' '}</span>
          )}
        </div>
        {error && <p className="k-gate-error">{error}</p>}
        <div className="k-keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
            <button key={key} onClick={() => press(key)}>
              {key}
            </button>
          ))}
          <button className="ghost" title="Smazat" onClick={() => press('back')}>
            <Delete size={26} />
          </button>
          <button onClick={() => press('0')}>0</button>
          <button
            className="ok"
            title="Potvrdit"
            disabled={!value || busy}
            onClick={() => press('ok')}
          >
            <Check size={30} strokeWidth={3} />
          </button>
        </div>
        <button className="k-gate-cancel" onClick={onCancel}>
          Zrušit
        </button>
      </div>
    </div>
  )
}
