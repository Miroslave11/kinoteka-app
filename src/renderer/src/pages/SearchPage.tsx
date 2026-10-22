import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useApp } from '../app/AppContext'
import { DEFAULT_FILTERS, filterTitles } from '../app/catalogData'
import { useAmbientPalette } from '../app/palette'
import Poster from '../components/Poster'

export default function SearchPage(): React.JSX.Element {
  const { titles } = useApp()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  useAmbientPalette(null)
  const results = useMemo(
    () => filterTitles(titles, { ...DEFAULT_FILTERS, query, sort: 'name' }),
    [titles, query]
  )

  return (
    <div className="page">
      <h1>Hledání</h1>
      <p className="subtitle">
        „{query}“ · {results.length} {results.length === 1 ? 'výsledek' : 'výsledků'}
      </p>
      {results.length === 0 && <p className="empty">Nic nenalezeno. Zkus jiný název.</p>}
      <div className="grid">
        {results.map((title) => (
          <Poster key={`${title.kind}-${title.id}`} title={title} />
        ))}
      </div>
    </div>
  )
}
