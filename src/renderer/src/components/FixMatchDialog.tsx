import { useEffect, useState, type FormEvent } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Link } from 'react-router'
import { parseTmdbUrl, type MetadataSearchResult } from '../../../shared/metadata'
import { displayName, displayYear, type TitleItem } from '../app/catalogData'
import { placeholderStyle } from '../app/palette'
import Artwork from './Artwork'

/** „Opravit shodu“: vyhledání titulu na TMDB a ruční výběr. */
export default function FixMatchDialog({
  title,
  onClose
}: {
  title: TitleItem
  onClose: () => void
}): React.JSX.Element {
  const { metadata } = window.kinoteka
  const [query, setQuery] = useState(title.name)
  const [year, setYear] = useState(title.year ? String(title.year) : '')
  const [results, setResults] = useState<MetadataSearchResult[] | null>(null)
  const [selected, setSelected] = useState<number | null>(title.metadata?.tmdbId ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyMissing, setKeyMissing] = useState(false)

  useEffect(() => {
    void metadata.keyStatus().then((status) => setKeyMissing(!status.configured))
  }, [metadata])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const search = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    setError(null)
    // Vložený odkaz z webu TMDB se použije rovnou.
    const link = parseTmdbUrl(query)
    if (link) {
      if (link.kind !== title.kind) {
        setError(
          title.kind === 'movie'
            ? 'Odkaz vede na seriál, ne na film.'
            : 'Odkaz vede na film, ne na seriál.'
        )
        return
      }
      await apply(link.tmdbId)
      return
    }
    setBusy(true)
    try {
      const parsedYear = Number.parseInt(year, 10)
      setResults(
        await metadata.search(title.kind, query, Number.isFinite(parsedYear) ? parsedYear : null)
      )
    } catch (searchError) {
      setError((searchError as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const apply = async (tmdbId: number): Promise<void> => {
    setBusy(true)
    const result = await metadata.applyMatch(title.id, tmdbId)
    setBusy(false)
    if (result.ok) onClose()
    else setError(result.message)
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="Opravit shodu"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>Opravit shodu</h3>
          <button className="icon-btn sm" onClick={onClose} title="Zavřít (Esc)">
            <X size={16} />
          </button>
        </header>
        <p className="muted">
          {title.kind === 'movie' ? 'Film' : 'Seriál'} „{displayName(title)}“
          {displayYear(title) ? ` (${displayYear(title)})` : ''}. Vyhledej správný titul na TMDB,
          nebo vlož odkaz z webu themoviedb.org.
        </p>

        {keyMissing ? (
          <p className="notice is-error">
            Chybí klíč TMDB. Zadej ho v{' '}
            <Link to="/nastaveni?sekce=metadata" onClick={onClose}>
              Nastavení → Metadata
            </Link>
            .
          </p>
        ) : (
          <form className="search-form" onSubmit={(e) => void search(e)}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Název nebo odkaz na TMDB"
            />
            <input
              className="year"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Rok"
              inputMode="numeric"
            />
            <button className="btn sm primary" disabled={busy || !query.trim()}>
              <Search size={16} /> Hledat
            </button>
          </form>
        )}

        {error && <p className="notice is-error">{error}</p>}
        {results && results.length === 0 && (
          <p className="empty">Nic nenalezeno. Zkus jiný název nebo smaž rok.</p>
        )}
        <div className="results">
          {results?.map((result) => (
            <button
              key={result.tmdbId}
              className={`result ${selected === result.tmdbId ? 'on' : ''}`}
              onClick={() => setSelected(result.tmdbId)}
              onDoubleClick={() => void apply(result.tmdbId)}
            >
              <span className="result-thumb" style={placeholderStyle(result.name)}>
                <Artwork src={result.posterThumbUrl} />
              </span>
              <span className="result-text">
                <b>
                  {result.name} {result.year && <span className="muted">({result.year})</span>}
                </b>
                {result.originalName && <span className="muted">{result.originalName}</span>}
                {result.overview && <small>{result.overview}</small>}
              </span>
              {selected === result.tmdbId && (
                <span className="ok-dot">
                  <Check size={14} />
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="dialog-foot">
          <button className="btn sm" onClick={onClose}>
            Zrušit
          </button>
          <button
            className="btn sm primary"
            disabled={busy || selected === null || !results?.some((r) => r.tmdbId === selected)}
            onClick={() => selected !== null && void apply(selected)}
          >
            Použít
          </button>
        </div>
      </div>
    </div>
  )
}
