import { useState } from 'react'
import { useAmbientPalette } from '../app/palette'
import LibrarySettings from '../library/LibrarySettings'
import PlayerTest from '../library/PlayerTest'

type Section = 'library' | 'player'

const SECTIONS: [Section, string][] = [
  ['library', 'Knihovna'],
  ['player', 'Přehrávač']
]

export default function SettingsPage(): React.JSX.Element {
  const [section, setSection] = useState<Section>('library')
  useAmbientPalette(null)

  return (
    <div className="page">
      <h1>Nastavení</h1>
      <div className="settings">
        <nav className="s-nav">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="s-body">{section === 'library' ? <LibrarySettings /> : <PlayerTest />}</div>
      </div>
    </div>
  )
}
