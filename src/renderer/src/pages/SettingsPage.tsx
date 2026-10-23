import { useSearchParams } from 'react-router'
import { useAmbientPalette } from '../app/palette'
import AboutApp from '../library/AboutApp'
import AppearanceSettings from '../library/AppearanceSettings'
import LibrarySettings from '../library/LibrarySettings'
import ImdbSettings from '../library/ImdbSettings'
import MetadataSettings from '../library/MetadataSettings'
import PlayerTest from '../library/PlayerTest'
import SoundSettings from '../library/SoundSettings'
import SubtitlePrefs from '../library/SubtitlePrefs'

type Section = 'knihovna' | 'metadata' | 'zvuk' | 'titulky' | 'vzhled' | 'prehravac' | 'o-aplikaci'

const SECTIONS: [Section, string][] = [
  ['knihovna', 'Knihovna'],
  ['metadata', 'Metadata (TMDB, IMDb)'],
  ['zvuk', 'Zvuk'],
  ['titulky', 'Titulky'],
  ['vzhled', 'Vzhled'],
  ['prehravac', 'Přehrávač'],
  ['o-aplikaci', 'O aplikaci']
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
          {section === 'zvuk' && <SoundSettings />}
          {section === 'titulky' && <SubtitlePrefs />}
          {section === 'vzhled' && <AppearanceSettings />}
          {section === 'prehravac' && <PlayerTest />}
          {section === 'o-aplikaci' && <AboutApp />}
        </div>
      </div>
    </div>
  )
}
