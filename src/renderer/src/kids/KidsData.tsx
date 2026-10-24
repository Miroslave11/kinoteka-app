import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_KIDS_SETTINGS,
  type KidsMode,
  type KidsSettings,
  type KidsTitle,
  type KidsVideo
} from '../../../shared/kids'

const INITIAL_MODE: KidsMode = { locked: true, parent: false, hasPin: false, timeLeftSec: null }

interface KidsState {
  titles: KidsTitle[]
  /** Všechna videa (nejnověji přidaná první). */
  videos: KidsVideo[]
  settings: KidsSettings
  mode: KidsMode
  loading: boolean
  /** Pohádky pro dnešek skončily (denní limit). */
  limitReached: boolean
  titleOf: (video: KidsVideo) => KidsTitle | undefined
  play: (video: KidsVideo) => Promise<void>
  reload: () => Promise<void>
}

const KidsContext = createContext<KidsState | null>(null)

/** Tituly, videa, nastavení a stav dětského režimu; obnovuje se při každé změně. */
export function KidsDataProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { kids, player } = window.kinoteka
  const [titles, setTitles] = useState<KidsTitle[]>([])
  const [settings, setSettings] = useState<KidsSettings>(DEFAULT_KIDS_SETTINGS)
  const [mode, setMode] = useState<KidsMode>(INITIAL_MODE)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [list, saved, current] = await Promise.all([
      kids.listTitles(),
      kids.getSettings(),
      kids.mode()
    ])
    setTitles(list)
    setSettings(saved)
    setMode(current)
    setLoading(false)
  }, [kids])

  useEffect(() => {
    void reload()
    // Dítě mohlo mezitím dostat nová videa (stažená nebo zkopírovaná do složky).
    void kids.scan()
    const offChanged = kids.onChanged(() => void reload())
    // Po zavření přehrávače se změnil zbývající čas pohádek.
    const offClosed = player.onClosed(() => void reload())
    return () => {
      offChanged()
      offClosed()
    }
  }, [kids, player, reload])

  const value = useMemo<KidsState>(() => {
    const videos = titles
      .flatMap((t) => t.videos)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || b.id - a.id)
    const byId = new Map(titles.map((t) => [t.id, t]))
    const limitReached = mode.timeLeftSec === 0
    return {
      titles,
      videos,
      settings,
      mode,
      loading,
      limitReached,
      titleOf: (video) => byId.get(video.titleId),
      play: async (video) => {
        if (!limitReached) await kids.playVideo(video.id)
      },
      reload
    }
  }, [titles, settings, mode, loading, kids, reload])

  return <KidsContext.Provider value={value}>{children}</KidsContext.Provider>
}

export function useKids(): KidsState {
  const state = useContext(KidsContext)
  if (!state) throw new Error('useKids musí být uvnitř KidsDataProvider')
  return state
}
