import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { formatSize } from '../../../shared/library'
import { useApp } from '../app/AppContext'
import { filesOf } from '../app/catalogData'

export default function TopBar(): React.JSX.Element {
  const { titles, folders } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const input = useRef<HTMLInputElement>(null)
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
        {files.length} souborů · {formatSize(totalSize)}
      </div>
    </div>
  )
}
