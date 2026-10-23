import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { formatRelativeTime } from '../../../shared/library'
import { IMDB_ATTRIBUTION, type ImdbStatus } from '../../../shared/metadata'

/** Nastavení → Metadata: hodnocení z IMDb. */
export default function ImdbSettings(): React.JSX.Element {
  const { imdb, library } = window.kinoteka
  const [status, setStatus] = useState<ImdbStatus | null>(null)

  const reload = useCallback(() => void imdb.status().then(setStatus), [imdb])
  useEffect(() => {
    reload()
    return library.onChanged(reload)
  }, [library, reload])

  const toggle = async (): Promise<void> => {
    await imdb.setEnabled(!status?.enabled)
    reload()
  }

  return (
    <section className="card">
      <h2>IMDb – hodnocení od milionů diváků</h2>
      <label className="toggle-row">
        <input type="checkbox" checked={status?.enabled ?? false} onChange={() => void toggle()} />
        <span>Načítat hodnocení z IMDb</span>
      </label>
      <p className="muted small">
        Aplikace jednou týdně stáhne oficiální datový soubor IMDb s hodnocením všech titulů (asi 9
        MB) a hodnocení najde podle IMDb ID z TMDB. Nepotřebuje klíč a funguje i bez internetu ze
        staženého souboru.
      </p>
      <dl className="kv">
        <dt>Hodnocení</dt>
        <dd>
          {status?.rated ?? 0} z {status?.titles ?? 0} titulů s IMDb ID
        </dd>
        <dt>Data IMDb</dt>
        <dd>
          {status?.updating
            ? 'stahuji…'
            : status?.downloadedAt
              ? `staženo ${formatRelativeTime(status.downloadedAt)}`
              : 'zatím nestaženo'}
          {status?.datasetDate && (
            <span className="muted">
              {' '}
              · vydáno {new Date(status.datasetDate).toLocaleDateString('cs-CZ')}
            </span>
          )}
        </dd>
      </dl>
      {status?.error && <p className="notice is-error">{status.error}</p>}
      <div className="actions">
        <button
          className="btn sm"
          disabled={!status?.enabled || status.updating}
          onClick={() => void imdb.updateNow().then(reload)}
        >
          <RefreshCw size={15} className={status?.updating ? 'spin' : ''} /> Aktualizovat teď
        </button>
      </div>
      <p className="versions">{IMDB_ATTRIBUTION}</p>
    </section>
  )
}
