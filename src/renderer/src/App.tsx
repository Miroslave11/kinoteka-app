import { useEffect, useState } from 'react'
import LibraryPage from './library/LibraryPage'
import PlayerTestPage from './PlayerTestPage'

type Tab = 'library' | 'player'

/** Dočasná kostra UI; skutečný vzhled podle mockupů přijde v přírůstku 5. */
export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [playerError, setPlayerError] = useState<string | null>(null)

  useEffect(() => window.kinoteka.player.onClosed((info) => setPlayerError(info.error ?? null)), [])

  return (
    <div className="shell">
      <header className="topnav">
        <div className="brand">
          <span className="brand-mark" />
          Kinotéka
        </div>
        <nav>
          <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>
            Knihovna
          </button>
          <button className={tab === 'player' ? 'on' : ''} onClick={() => setTab('player')}>
            Přehrávač (test)
          </button>
        </nav>
      </header>
      {playerError && (
        <p className="notice is-error floating" onClick={() => setPlayerError(null)}>
          {playerError}
        </p>
      )}
      <main>{tab === 'library' ? <LibraryPage /> : <PlayerTestPage />}</main>
    </div>
  )
}
