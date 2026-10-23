import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { TMDB_ATTRIBUTION, type TmdbKeyStatus } from '../../../shared/metadata'
import { formatRelativeTime } from '../../../shared/library'
import { useApp } from '../app/AppContext'

/** Nastavení → Metadata: klíč TMDB a přehled dohledaných titulů. */
export default function MetadataSettings(): React.JSX.Element {
  const { metadata } = window.kinoteka
  const { titles } = useApp()
  const [status, setStatus] = useState<TmdbKeyStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  useEffect(() => {
    void metadata.keyStatus().then(setStatus)
  }, [metadata])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const result = await metadata.saveKey(key)
    setBusy(false)
    if (result.ok) {
      setKey('')
      setMessage({ text: 'Klíč je ověřený a uložený. Údaje se teď dohledávají na pozadí.' })
      setStatus(await metadata.keyStatus())
    } else {
      setMessage({ text: result.message, error: true })
    }
  }

  const remove = async (): Promise<void> => {
    await metadata.removeKey()
    setStatus(await metadata.keyStatus())
    setMessage({ text: 'Klíč byl odebrán. Už stažené údaje zůstávají.' })
  }

  const count = (statuses: string[]): number =>
    titles.filter((t) => statuses.includes(t.matchStatus)).length

  return (
    <div className="s-stack">
      <section className="card">
        <h2>TMDB – plakáty, pozadí, popisy, herci, díly seriálů</h2>
        {status?.configured ? (
          <div className="key-row">
            <CheckCircle2 size={18} className="ok" />
            <span>
              Klíč je uložený (šifrovaně)
              {status.checkedAt && (
                <span className="muted"> · ověřen {formatRelativeTime(status.checkedAt)}</span>
              )}
            </span>
            <span className="spacer" />
            <button className="btn sm" onClick={() => void remove()}>
              <Trash2 size={15} /> Odebrat klíč
            </button>
          </div>
        ) : (
          <>
            <p className="muted">
              TMDB je bezplatná databáze filmů. Pro její použití potřebuješ vlastní API klíč:
              zaregistruj se na themoviedb.org, v nastavení účtu otevři sekci API a zkopíruj „API
              Key“ nebo „API Read Access Token“.
            </p>
            <a
              className="link"
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} /> Otevřít nastavení API na themoviedb.org
            </a>
          </>
        )}
        <form className="search-form" onSubmit={(e) => void save(e)}>
          <KeyRound size={18} className="muted" />
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={status?.configured ? 'Nový klíč (nahradí současný)' : 'Vlož API klíč TMDB'}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn sm primary" disabled={busy || !key.trim()}>
            {busy ? 'Ověřuji…' : 'Ověřit a uložit'}
          </button>
        </form>
        {message && <p className={`notice ${message.error ? 'is-error' : ''}`}>{message.text}</p>}
      </section>

      <section className="card">
        <h2>Stav dohledání</h2>
        <dl className="kv">
          <dt>Dohledáno</dt>
          <dd>
            {count(['matched', 'manual'])} z {titles.length} titulů
          </dd>
          <dt>Čeká</dt>
          <dd>{count(['pending'])}</dd>
          <dt>Nedohledáno</dt>
          <dd>
            {count(['unmatched'])}
            {count(['unmatched']) > 0 && (
              <span className="muted"> – v detailu titulu použij „Opravit shodu“</span>
            )}
          </dd>
          <dt>Chyba</dt>
          <dd>{count(['error'])}</dd>
        </dl>
        <p className="versions">{TMDB_ATTRIBUTION}</p>
      </section>
    </div>
  )
}
