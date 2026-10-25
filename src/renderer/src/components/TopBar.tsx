import { useEffect, useRef } from 'react'
import { Expand, Power, Search, Shrink } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { formatSize } from '../../../shared/library'
import { useApp } from '../app/AppContext'
import { useFullscreen } from '../app/fullscreen'
import { filesOf } from '../app/catalogData'
import { countOf } from '../../../shared/plural'

export default function TopBar(): React.JSX.Element {
  const { titles, folders } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const input = useRef<HTMLInputElement>(null)
  const [fullscreen, setFullscreen] = useFullscreen()
  const query = location.pathname === '/hledat' ? (params.get('q') ?? '') : ''

  // Ctrl+K přesune kurzor do vyhledávání.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSearch = (value: string): void => {
    if (value)
      navigate(`/hledat?q=${encodeURIComponent(value)}`, {
        replace: location.pathname === '/hledat'
      })
    else navigate(-1)
  }

  const files = titles.flatMap(filesOf)
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const offline = folders.filter((folder) => !folder.online).length

  return (
    <div className="topbar">
      <label className="search">
        <Search size={17} />
        <input
          ref={input}
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Hledat filmy a seriály…"
          spellCheck={false}
        />
        <span className="badge">Ctrl K</span>
      </label>
      <span className="spacer" />
      <div className="status">
        <i className={`dot ${offline ? 'off' : ''}`} />
        {offline ? `${offline} knihovna offline · ` : 'Knihovna aktuální · '}
        {countOf(files.length, 'soubor', 'soubory', 'souborů')} · {formatSize(totalSize)}
      </div>
      <button
        className="icon-btn topbar-btn"
        onClick={() => setFullscreen(!fullscreen)}
        title={fullscreen ? 'Zobrazit v okně (F11)' : 'Celá obrazovka (F11)'}
        aria-label={fullscreen ? 'Zobrazit v okně' : 'Celá obrazovka'}
      >
        {fullscreen ? <Shrink size={18} /> : <Expand size={18} />}
      </button>
      {fullscreen && (
        <button
          className="icon-btn topbar-btn"
          onClick={() => void window.kinoteka.app.quit()}
          title="Ukončit Kinotéku"
          aria-label="Ukončit Kinotéku"
        >
          <Power size={18} />
        </button>
      )}
    </div>
  )
}
