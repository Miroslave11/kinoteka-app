import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_KIDS_SETTINGS,
  type KidsSettings,
  type KidsTitle,
  type KidsVideo
} from '../../../shared/kids'

interface KidsState {
  titles: KidsTitle[]
  /** Všechna videa (nejnověji přidaná první). */
  videos: KidsVideo[]
  settings: KidsSettings
  loading: boolean
  titleOf: (video: KidsVideo) => KidsTitle | undefined
  play: (video: KidsVideo) => Promise<void>
}

const KidsContext = createContext<KidsState | null>(null)

/** Tituly, videa a nastavení dětské části; obnovuje se při každé změně složky Kids. */
export function KidsDataProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { kids } = window.kinoteka
  const [titles, setTitles] = useState<KidsTitle[]>([])
  const [settings, setSettings] = useState<KidsSettings>(DEFAULT_KIDS_SETTINGS)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [list, saved] = await Promise.all([kids.listTitles(), kids.getSettings()])
    setTitles(list)
    setSettings(saved)
    setLoading(false)
  }, [kids])

  useEffect(() => {
    void reload()
    // Dítě mohlo mezitím dostat nová videa (stažená nebo zkopírovaná do složky).
    void kids.scan()
    return kids.onChanged(() => void reload())
  }, [kids, reload])

  const value = useMemo<KidsState>(() => {
    const videos = titles
      .flatMap((t) => t.videos)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || b.id - a.id)
    const byId = new Map(titles.map((t) => [t.id, t]))
    return {
      titles,
      videos,
      settings,
      loading,
      titleOf: (video) => byId.get(video.titleId),
      play: async (video) => {
        await kids.playVideo(video.id)
      }
    }
  }, [titles, settings, loading, kids])

  return <KidsContext.Provider value={value}>{children}</KidsContext.Provider>
}

export function useKids(): KidsState {
  const state = useContext(KidsContext)
  if (!state) throw new Error('useKids musí být uvnitř KidsDataProvider')
  return state
}
