import { useCallback, useEffect, useState } from 'react'
import type { LibraryFolder, MediaFileSummary, ScanProgress } from '../../../shared/library'

export interface LibraryData {
  folders: LibraryFolder[]
  files: MediaFileSummary[]
  /** Průběh běžících skenů podle id složky. */
  progress: Record<number, ScanProgress>
  loading: boolean
}

/** Stav knihovny z hlavního procesu; obnoví se při každé změně. */
export function useLibrary(): LibraryData {
  const { library } = window.kinoteka
  const [data, setData] = useState<Omit<LibraryData, 'progress'>>({
    folders: [],
    files: [],
    loading: true
  })
  const [progress, setProgress] = useState<Record<number, ScanProgress>>({})

  const reload = useCallback(async () => {
    const [folders, files] = await Promise.all([library.listFolders(), library.listFiles()])
    setData({ folders, files, loading: false })
  }, [library])

  useEffect(() => {
    void reload()
    return library.onChanged(() => void reload())
  }, [library, reload])

  useEffect(
    () =>
      library.onScanProgress((update) =>
        setProgress((current) => {
          const next = { ...current }
          if (update.done) delete next[update.folderId]
          else next[update.folderId] = update
          return next
        })
      ),
    [library]
  )

  return { ...data, progress }
}
