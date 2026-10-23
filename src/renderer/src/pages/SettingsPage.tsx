import { useSearchParams } from 'react-router'
import { useAmbientPalette } from '../app/palette'
import LibrarySettings from '../library/LibrarySettings'
import CsfdSettings from '../library/CsfdSettings'
import MetadataSettings from '../library/MetadataSettings'
import PlayerTest from '../library/PlayerTest'

type Section = 'knihovna' | 'metadata' | 'prehravac'

const SECTIONS: [Section, string][] = [
  ['knihovna', 'Knihovna'],
  ['metadata', 'Metadata (TMDB, ČSFD)'],
  ['prehravac', 'Přehrávač']
]

export default function SettingsPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const requested = params.get('sekce') as Section | null
  const section = SECTIONS.some(([id]) => id === requested) ? requested! : 'knihovna'
  useAmbientPalette(null)

  return (
    <div className="page">
      <h1>Nastavení</h1>
      <div className="settings">
        <nav className="s-nav">
          {SECTIONS.map(([id, label]) => (
            <button
              key={id}
              className={section === id ? 'on' : ''}
              onClick={() => setParams({ sekce: id }, { replace: true })}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="s-body">
          {section === 'knihovna' && <LibrarySettings />}
          {section === 'metadata' && (
            <>
              <MetadataSettings />
              <CsfdSettings />
            </>
          )}
          {section === 'prehravac' && <PlayerTest />}
        </div>
      </div>
    </div>
  )
}
