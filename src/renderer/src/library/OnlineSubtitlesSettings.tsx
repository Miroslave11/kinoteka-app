import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, KeyRound } from 'lucide-react'
import type { OnlineSubtitlesStatus } from '../../../shared/onlineSubtitles'

/** Nastavení → Titulky: klíč a účet OpenSubtitles.com pro stahování titulků. */
export default function OnlineSubtitlesSettings(): React.JSX.Element {
  const { onlineSubtitles } = window.kinoteka
  const [status, setStatus] = useState<OnlineSubtitlesStatus | null>(null)
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    void onlineSubtitles.status().then(setStatus)
  }, [onlineSubtitles])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const result = await onlineSubtitles.save({ apiKey, username, password })
    setBusy(false)
    if (!result.ok) {
      setMessage({ text: result.message, error: true })
      return
    }
    setStatus(await onlineSubtitles.status())
    setEditing(false)
    setApiKey('')
    setPassword('')
    setMessage({ text: 'Uloženo a ověřeno.', error: false })
  }

  const remove = async (): Promise<void> => {
    await onlineSubtitles.remove()
    setStatus(await onlineSubtitles.status())
    setMessage(null)
  }

  const showForm = editing || status?.configured === false

  return (
    <section className="card">
      <h2>Stahování titulků z internetu</h2>
      <p className="muted small">
        V přehrávači je pak u titulků „Hledat na internetu…“. Titulky se hledají na
        OpenSubtitles.com podle filmu, dílu i přesného otisku souboru, uloží se vedle filmu a příště
        se načtou samy.
      </p>

      {status?.configured && !editing && (
        <div className="key-row">
          <KeyRound size={16} className="ok" />
          <span>
            Klíč je nastavený
            {status.username ? ` · přihlášený účet ${status.username}` : ' · bez přihlášení'}
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => setEditing(true)}>
            Změnit
          </button>
          <button className="btn sm" onClick={() => void remove()}>
            Odebrat
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={(event) => void save(event)}>
          <ol className="steps muted small">
            <li>
              Zaregistruj se zdarma na{' '}
              <a href="https://www.opensubtitles.com" target="_blank" rel="noreferrer">
                OpenSubtitles.com <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>
              V profilu otevři{' '}
              <a href="https://www.opensubtitles.com/consumers" target="_blank" rel="noreferrer">
                API Consumers <ExternalLink size={12} />
              </a>
              , vytvoř nový (název třeba „Kinotéka“) a zkopíruj jeho <b>API key</b>.
            </li>
            <li>
              Jméno a heslo jsou nepovinné – s přihlášením je vyšší denní limit stažení. Zadej
              uživatelské jméno, ne e-mail.
            </li>
          </ol>
          <div className="form-grid">
            <label htmlFor="os-key">Klíč API</label>
            <input
              id="os-key"
              className="field"
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              placeholder="API key z OpenSubtitles.com"
              onChange={(event) => setApiKey(event.target.value)}
            />
            <label htmlFor="os-user">Uživatelské jméno</label>
            <input
              id="os-user"
              className="field"
              value={username}
              autoComplete="off"
              placeholder="nepovinné"
              onChange={(event) => setUsername(event.target.value)}
            />
            <label htmlFor="os-pass">Heslo</label>
            <input
              id="os-pass"
              className="field"
              type="password"
              value={password}
              autoComplete="off"
              placeholder="nepovinné"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="actions">
            <button className="btn sm primary" type="submit" disabled={busy || !apiKey.trim()}>
              {busy ? 'Ověřuji…' : 'Ověřit a uložit'}
            </button>
            {status?.configured && (
              <button className="btn sm" type="button" onClick={() => setEditing(false)}>
                Zrušit
              </button>
            )}
          </div>
          <p className="muted small">Klíč a heslo se ukládají šifrovaně pod tvým účtem Windows.</p>
        </form>
      )}

      {message && <p className={`notice ${message.error ? 'is-error' : ''}`}>{message.text}</p>}
    </section>
  )
}
