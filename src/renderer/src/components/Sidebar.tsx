import { useEffect, useState } from 'react'
import { BookOpen, Clapperboard, Home, MonitorPlay, Settings2, Smile, Tv } from 'lucide-react'
import { NavLink } from 'react-router'
import appIcon from '../../../../build/icon.svg'
import { useApp } from '../app/AppContext'

/** Kolik pohádek je ve složce Kids (obnoví se po skenu, stažení nebo úpravě titulů). */
function useKidsVideoCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    const { kids } = window.kinoteka
    const load = (): void =>
      void kids
        .listTitles()
        .then((titles) => setCount(titles.reduce((sum, t) => sum + t.videos.length, 0)))
    load()
    return kids.onChanged(load)
  }, [])
  return count
}

/** Kolik videí je ve složce YT videa (obnoví se po skenu a přehrání). */
function useYtVideoCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    const { yt } = window.kinoteka
    const load = (): void =>
      void yt
        .listCategories()
        .then((categories) => setCount(categories.reduce((sum, c) => sum + c.videos.length, 0)))
    load()
    return yt.onChanged(load)
  }, [])
  return count
}

export default function Sidebar(): React.JSX.Element {
  const { movies, shows, folders } = useApp()
  const link = ({ isActive }: { isActive: boolean }): string => (isActive ? 'on' : '')
  const kids = useKidsVideoCount()
  const ytCount = useYtVideoCount()
  const [scanning, setScanning] = useState<ReadonlySet<number>>(new Set())

  /** Klik na knihovnu ji znovu proskenuje (hlavně aby se vrátil odpojený a znovu připojený disk). */
  const rescan = async (id: number): Promise<void> => {
    const toggle = (on: boolean): void =>
      setScanning((current) => {
        const next = new Set(current)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })
    toggle(true)
    try {
      await window.kinoteka.library.scan(id)
    } catch {
      // Výsledek skenu (i chyba) se projeví ve stavu složky po obnovení dat.
    } finally {
      toggle(false)
    }
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-mark" src={appIcon} alt="" />
        Kinotéka
      </div>
      <nav>
        <NavLink to="/" end className={link}>
          <Home size={18} /> Domů
        </NavLink>
        <NavLink to="/filmy" className={link}>
          <Clapperboard size={18} /> Filmy <span className="count">{movies.length}</span>
        </NavLink>
        <NavLink to="/serialy" className={link}>
          <Tv size={18} /> Seriály <span className="count">{shows.length}</span>
        </NavLink>
        <NavLink to="/deti" className={link}>
          <Smile size={18} /> Děti {kids !== null && <span className="count">{kids}</span>}
        </NavLink>
        <NavLink to="/yt" className={link}>
          <MonitorPlay size={18} /> YT videa{' '}
          {ytCount !== null && <span className="count">{ytCount}</span>}
        </NavLink>
      </nav>

      <div className="side-sep">Knihovny</div>
      {folders.length === 0 && <div className="lib muted">žádná složka</div>}
      {folders.map((folder) => {
        const busy = scanning.has(folder.id)
        return (
          <button
            key={folder.id}
            type="button"
            className={`lib lib-btn ${busy ? 'is-scanning' : ''}`}
            title={`${folder.path}\nKlikem znovu proskenovat`}
            disabled={busy}
            onClick={() => void rescan(folder.id)}
          >
            <i className={`dot ${folder.online ? '' : 'off'}`} />
            <span>
              {folder.name}
              {busy ? ' – skenuji…' : folder.online ? '' : ' – offline'}
            </span>
          </button>
        )
      })}

      <div className="side-bottom">
        <NavLink to="/nastaveni" className={link}>
          <Settings2 size={18} /> Nastavení
        </NavLink>
        <NavLink to="/denik" className={link}>
          <BookOpen size={18} /> Deník
        </NavLink>
      </div>
    </aside>
  )
}
