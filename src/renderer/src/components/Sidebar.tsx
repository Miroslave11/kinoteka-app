import { BookOpen, Clapperboard, Home, Settings2, Tv } from 'lucide-react'
import { NavLink } from 'react-router'
import { useApp } from '../app/AppContext'

export default function Sidebar(): React.JSX.Element {
  const { movies, shows, folders } = useApp()
  const link = ({ isActive }: { isActive: boolean }): string => (isActive ? 'on' : '')

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" />
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
        <NavLink to="/denik" className={link}>
          <BookOpen size={18} /> Deník
        </NavLink>
        <NavLink to="/deti" className="kids-nav">
          <span className="kids-nav-mark" /> Děti
        </NavLink>
      </nav>

      <div className="side-sep">Knihovny</div>
      {folders.length === 0 && <div className="lib muted">žádná složka</div>}
      {folders.map((folder) => (
        <div key={folder.id} className="lib" title={folder.path}>
          <i className={`dot ${folder.online ? '' : 'off'}`} />
          <span>
            {folder.name}
            {folder.online ? '' : ' – offline'}
          </span>
        </div>
      ))}

      <div className="side-bottom">
        <NavLink to="/nastaveni" className={link}>
          <Settings2 size={18} /> Nastavení
        </NavLink>
      </div>
    </aside>
  )
}
