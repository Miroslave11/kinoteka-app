import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { parseCsfdUrl } from '../../../shared/csfd'
import { displayName, displayYear, type TitleItem } from '../app/catalogData'

/** Ruční propojení titulu se stránkou na ČSFD (vložením odkazu z prohlížeče). */
export default function CsfdLinkDialog({
  title,
  onClose
}: {
  title: TitleItem
  onClose: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState(title.csfd?.url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const query = encodeURIComponent(`${displayName(title)} ${displayYear(title) ?? ''}`.trim())

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    const result = await window.kinoteka.csfd.link(title.id, url)
    setBusy(false)
    if (result.ok) onClose()
    else setError(result.message)
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="Propojit s ČSFD"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>Propojit s ČSFD</h3>
          <button className="icon-btn sm" onClick={onClose} title="Zavřít (Esc)">
            <X size={16} />
          </button>
        </header>
        <p className="muted">
          Najdi „{displayName(title)}“ na ČSFD ve svém prohlížeči a vlož sem odkaz na stránku filmu.
          Aplikace pak z ní načte hodnocení a popis.
        </p>
        {/* Vyhledávání otevírá prohlížeč uživatele – aplikace sama na ČSFD nehledá. */}
        <a
          className="link"
          href={`https://www.csfd.cz/hledat/?q=${query}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} /> Vyhledat na ČSFD v prohlížeči
        </a>
        <form className="search-form" onSubmit={(e) => void save(e)}>
          <input
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            placeholder="https://www.csfd.cz/film/117181-drz-hubu/prehled/"
            spellCheck={false}
          />
          <button className="btn sm primary" disabled={busy || parseCsfdUrl(url) === null}>
            Propojit
          </button>
        </form>
        {error && <p className="notice is-error">{error}</p>}
      </div>
    </div>
  )
}
