import { useEffect, useState } from 'react'
import MoviesPage from './catalog/MoviesPage'
import ShowsPage from './catalog/ShowsPage'
import LibraryPage from './library/LibraryPage'
import PlayerTestPage from './PlayerTestPage'

type Tab = 'movies' | 'shows' | 'library' | 'player'

const TABS: [Tab, string][] = [
  ['movies', 'Filmy'],
  ['shows', 'Seriály'],
  ['library', 'Knihovna'],
  ['player', 'Přehrávač (test)']
]

/** Dočasná kostra UI; skutečný vzhled podle mockupů přijde v přírůstku 5. */
export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('movies')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.kinoteka.player.onClosed((info) => setError(info.error ?? null)), [])

  return (
    <div className="shell">
      <header className="topnav">
        <div className="brand">
          <span className="brand-mark" />
          Kinotéka
        </div>
        <nav>
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {error && (
        <p className="notice is-error floating" onClick={() => setError(null)}>
          {error}
        </p>
      )}
      <main>
        {tab === 'movies' && <MoviesPage onError={setError} />}
        {tab === 'shows' && <ShowsPage onError={setError} />}
        {tab === 'library' && <LibraryPage />}
        {tab === 'player' && <PlayerTestPage />}
      </main>
    </div>
  )
}
