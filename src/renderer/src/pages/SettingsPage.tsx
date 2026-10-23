import { useSearchParams } from 'react-router'
import { useAmbientPalette } from '../app/palette'
import AppearanceSettings from '../library/AppearanceSettings'
import LibrarySettings from '../library/LibrarySettings'
import ImdbSettings from '../library/ImdbSettings'
import MetadataSettings from '../library/MetadataSettings'
import PlayerTest from '../library/PlayerTest'

type Section = 'knihovna' | 'metadata' | 'vzhled' | 'prehravac'

const SECTIONS: [Section, string][] = [
  ['knihovna', 'Knihovna'],
  ['metadata', 'Metadata (TMDB, IMDb)'],
  ['vzhled', 'Vzhled'],
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
              <ImdbSettings />
            </>
          )}
          {section === 'vzhled' && <AppearanceSettings />}
          {section === 'prehravac' && <PlayerTest />}
        </div>
      </div>
    </div>
  )
}
