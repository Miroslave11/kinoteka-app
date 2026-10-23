import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'

/** Nastavení → Metadata: načítání hodnocení a popisů z ČSFD. */
export default function CsfdSettings(): React.JSX.Element {
  const { csfd } = window.kinoteka
  const { titles } = useApp()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    void csfd.enabled().then(setEnabled)
  }, [csfd])

  const toggle = async (): Promise<void> => {
    const next = !enabled
    await csfd.setEnabled(next)
    setEnabled(next)
  }

  const count = (statuses: string[]): number =>
    titles.filter((t) => statuses.includes(t.csfdStatus)).length
  const loaded = titles.filter((t) => t.csfd).length

  return (
    <section className="card">
      <h2>ČSFD – hodnocení v %, český popis, žánry</h2>
      <label className="toggle-row">
        <input type="checkbox" checked={enabled ?? false} onChange={() => void toggle()} />
        <span>Načítat údaje z ČSFD</span>
      </label>
      <p className="muted small">
        Odkaz na film na ČSFD aplikace zjistí přes Wikidata podle údajů z TMDB, na ČSFD nic
        nevyhledává. Stránky filmů načítá po jedné s pětisekundovou pauzou a obnovuje je nejvýš
        jednou za měsíc. ČSFD nemá veřejné API, takže tahle funkce se může rozbít, když ČSFD změní
        vzhled stránek, a její používání je na vlastní odpovědnost vůči podmínkám ČSFD.
      </p>
      <dl className="kv">
        <dt>Načteno</dt>
        <dd>
          {loaded} z {titles.length} titulů
        </dd>
        <dt>Čeká</dt>
        <dd>
          {titles.filter((t) => t.csfdStatus === 'linked' && !t.csfd).length + count(['pending'])}
        </dd>
        <dt>Nenalezeno</dt>
        <dd>
          {count(['notfound'])}
          {count(['notfound']) > 0 && (
            <span className="muted"> – v detailu titulu použij „Propojit s ČSFD“</span>
          )}
        </dd>
        <dt>Chyba</dt>
        <dd>{count(['error'])}</dd>
      </dl>
    </section>
  )
}
