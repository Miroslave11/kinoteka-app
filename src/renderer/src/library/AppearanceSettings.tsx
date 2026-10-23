import { useCallback, useEffect, useState } from 'react'
import type { PreviewStatus } from '../../../shared/posterPalette'

/** Nastavení → Vzhled: klipy z filmů na pozadí. */
export default function AppearanceSettings(): React.JSX.Element {
  const { preview, library } = window.kinoteka
  const [status, setStatus] = useState<PreviewStatus | null | undefined>(undefined)

  const reload = useCallback(() => void preview.status().then(setStatus), [preview])
  useEffect(() => {
    reload()
    return library.onChanged(reload)
  }, [library, reload])

  const toggle = async (): Promise<void> => {
    await preview.setClipsEnabled(!status?.clipsEnabled)
    reload()
  }

  return (
    <div className="s-stack">
      <section className="card">
        <h2>Barvy a pozadí</h2>
        <p className="muted small">
          Barvy aplikace se přizpůsobují plakátu zobrazeného filmu. Spočítají se jednou po stažení
          plakátu z TMDB.
        </p>
      </section>
      <section className="card">
        <h2>Klipy z filmů na pozadí</h2>
        {status === null ? (
          <p className="notice is-error">
            Chybí ffmpeg – klipy nejde vyrobit (ve vývoji spusť npm run fetch:ffmpeg).
          </p>
        ) : (
          <>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={status?.clipsEnabled ?? false}
                onChange={() => void toggle()}
              />
              <span>Přehrávat na pozadí krátké klipy z filmů</span>
            </label>
            <p className="muted small">
              Z každého filmu (u seriálu z prvního dílu) se na pozadí vyříznou tři tiché klipy po 8
              s, asi 0,5–2 MB na titul. Výroba běží se sníženou prioritou a jen jednou. Vypnutím se
              klipy smažou. Klipy se nepřehrávají, když je zapnuté „Omezit animace“ ve Windows.
            </p>
            <dl className="kv">
              <dt>Stav</dt>
              <dd>
                {!status?.clipsEnabled
                  ? 'vypnuto'
                  : status.pending > 0
                    ? `čeká ${status.pending} ${status.pending >= 5 ? 'titulů' : 'tituly'}${status.working ? ' · vyrábím…' : ''}`
                    : 'hotovo'}
              </dd>
            </dl>
          </>
        )}
      </section>
    </div>
  )
}
