import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { MovieItem, ShowItem } from '../../../shared/catalog'
import type { LibraryFolder } from '../../../shared/library'
import type { TitleItem } from './catalogData'

interface AppState {
  movies: MovieItem[]
  shows: ShowItem[]
  /** Filmy i seriály dohromady (Domů, vyhledávání). */
  titles: TitleItem[]
  folders: LibraryFolder[]
  loading: boolean
  /** Přehraje soubor z knihovny; chybu ukáže jako oznámení. */
  play: (fileId: number) => Promise<void>
  /** Detail souboru otevřený v panelu Vlastnosti. */
  detailsFileId: number | null
  showDetails: (fileId: number | null) => void
  error: string | null
  setError: (message: string | null) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { catalog, library, player } = window.kinoteka
  const [data, setData] = useState({
    movies: [] as MovieItem[],
    shows: [] as ShowItem[],
    folders: [] as LibraryFolder[],
    loading: true
  })
  const [error, setError] = useState<string | null>(null)
  const [detailsFileId, showDetails] = useState<number | null>(null)

  const reload = useCallback(async () => {
    const [movies, shows, folders] = await Promise.all([
      catalog.listMovies(),
      catalog.listShows(),
      library.listFolders()
    ])
    setData({ movies, shows, folders, loading: false })
  }, [catalog, library])

  useEffect(() => {
    void reload()
    return library.onChanged(() => void reload())
  }, [library, reload])

  useEffect(() => player.onClosed((info) => setError(info.error ?? null)), [player])

  const play = useCallback(
    async (fileId: number) => {
      const result = await player.playFile(fileId)
      if (!result.ok && result.reason === 'error') setError(result.message)
    },
    [player]
  )

  const value = useMemo<AppState>(
    () => ({
      ...data,
      titles: [
        ...data.movies.map((movie) => ({ kind: 'movie' as const, ...movie })),
        ...data.shows.map((show) => ({ kind: 'show' as const, ...show }))
      ],
      play,
      detailsFileId,
      showDetails,
      error,
      setError
    }),
    [data, play, detailsFileId, error]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const state = useContext(AppContext)
  if (!state) throw new Error('useApp musí být uvnitř AppProvider')
  return state
}
