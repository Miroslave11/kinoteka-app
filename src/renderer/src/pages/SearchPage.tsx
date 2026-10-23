import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useApp } from '../app/AppContext'
import { searchTitles } from '../app/catalogData'
import { useAmbientPalette } from '../app/palette'
import Poster from '../components/Poster'

/** Hledání (Ctrl+K): shoda v názvu (i originálním) a zvlášť shoda v hercích a tvůrcích. */
export default function SearchPage(): React.JSX.Element {
  const { titles } = useApp()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  useAmbientPalette(null)
  const { byName, byPerson } = useMemo(() => searchTitles(titles, query), [titles, query])
  const total = byName.length + byPerson.length

  return (
    <div className="page">
      <h1>Hledání</h1>
      <p className="subtitle">
        „{query}“ · {total}{' '}
        {total === 1 ? 'výsledek' : total >= 2 && total <= 4 ? 'výsledky' : 'výsledků'}
      </p>
      {total === 0 && (
        <p className="empty">Nic nenalezeno. Hledat jde podle názvu, originálního názvu i herců.</p>
      )}

      {byName.length > 0 && (
        <section className="search-group">
          {byPerson.length > 0 && <h3>Názvy</h3>}
          <div className="grid">
            {byName.map((title) => (
              <Poster key={`${title.kind}-${title.id}`} title={title} />
            ))}
          </div>
        </section>
      )}

      {byPerson.length > 0 && (
        <section className="search-group">
          <h3>Herci a tvůrci</h3>
          <div className="grid">
            {byPerson.map(({ title, people }) => (
              <div key={`${title.kind}-${title.id}`} className="person-hit">
                <Poster title={title} />
                <span className="person-hit-name">{people.join(', ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
