import { useCallback, useEffect, useState } from 'react'
import type { MovieItem, ShowItem } from '../../../shared/catalog'

export interface CatalogData {
  movies: MovieItem[]
  shows: ShowItem[]
  loading: boolean
}

/** Filmy a seriály z hlavního procesu; obnoví se po každém skenu knihovny. */
export function useCatalog(): CatalogData {
  const { catalog, library } = window.kinoteka
  const [data, setData] = useState<CatalogData>({ movies: [], shows: [], loading: true })

  const reload = useCallback(async () => {
    const [movies, shows] = await Promise.all([catalog.listMovies(), catalog.listShows()])
    setData({ movies, shows, loading: false })
  }, [catalog])

  useEffect(() => {
    void reload()
    return library.onChanged(() => void reload())
  }, [library, reload])

  return data
}

/** Zástupná barva plakátu odvozená z názvu, dokud nejsou obrázky z TMDB. */
export function placeholderStyle(name: string): React.CSSProperties {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0
  const hue = Math.abs(hash) % 360
  return {
    background: `radial-gradient(120% 80% at 30% 0%, hsl(${hue} 70% 45% / 0.9), transparent 60%),
      linear-gradient(165deg, hsl(${hue} 55% 22%), hsl(${(hue + 40) % 360} 50% 8%))`
  }
}
