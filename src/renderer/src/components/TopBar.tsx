import { useEffect, useRef } from 'react'
import { Expand, Power, Search, Shrink } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { formatSize } from '../../../shared/library'
import { useApp } from '../app/AppContext'
import { useFullscreen } from '../app/fullscreen'
import { filesOf } from '../app/catalogData'
import { countOf } from '../../../shared/plural'
import { haBulbState } from '../../../shared/ha'
import HaBulb, { isHaToggleKey, toggleHa, useHaStatus } from './HaBulb'

export default function TopBar(): React.JSX.Element {
  const { titles, folders } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const input = useRef<HTMLInputElement>(null)
  const [fullscreen, setFullscreen] = useFullscreen()
  const query = location.pathname === '/hledat' ? (params.get('q') ?? '') : ''
  const ha = useHaStatus()
  const haActive = haBulbState(ha) !== 'hidden'

  // Ctrl+K přesune kurzor do vyhledávání, L přepne žárovku (Home Assistant).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
      } else if (haActive && isHaToggleKey(event)) {
        event.preventDefault()
        toggleHa()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [haActive])

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
      <HaBulb status={ha} className="icon-btn topbar-btn" />
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
