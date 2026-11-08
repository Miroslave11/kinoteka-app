import { useEffect, useRef, useState } from 'react'
import { Cloud, Download, ExternalLink, FolderInput, Play, Trash2 } from 'lucide-react'
import { formatSize } from '../../../shared/library'
import type { YtCategory, YtVideoSummary } from '../../../shared/yt'

export interface YtMenuState {
  video: YtVideoSummary
  /** Kategorie, ve které video je (null = čeká na zařazení). */
  categoryId: number | null
  x: number
  y: number
}

/**
 * Nabídka u videa (pravé tlačítko nebo ⋯): přehrát, přesunout do jiné kategorie, otevřít
 * na YouTube, smazat do Koše (na druhé kliknutí).
 */
export default function YtVideoMenu({
  menu,
  categories,
  onPlay,
  onMove,
  onTrash,
  onKeepOnline,
  onDownload,
  onClose
}: {
  menu: YtMenuState
  categories: YtCategory[]
  onPlay: (id: number) => void
  onMove: (videoId: number, categoryId: number) => void
  onTrash: (videoId: number) => void
  /** Stažené video: smazat soubor, ponechat odkaz (online). */
  onKeepOnline: (videoId: number) => void
  /** Online video: stáhnout do počítače. */
  onDownload: (video: YtVideoSummary) => void
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmingOnline, setConfirmingOnline] = useState(false)
  const [position, setPosition] = useState({ left: menu.x, top: menu.y })

  // Nabídka nesmí přetéct okraj okna.
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setPosition({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8))
    })
  }, [menu.x, menu.y])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  const targets = categories.filter((c) => c.id !== null && c.id !== menu.categoryId)
  const act = (work: () => void): void => {
    work()
    onClose()
  }

  return (
    <div ref={ref} className="yt-menu" role="menu" style={position}>
      <div className="yt-menu-title">{menu.video.name}</div>
      <button role="menuitem" onClick={() => act(() => onPlay(menu.video.id))}>
        <Play size={15} /> {menu.video.progress !== null ? 'Pokračovat' : 'Přehrát'}
      </button>
      {targets.length > 0 && (
        <>
          <div className="yt-menu-label">
            <FolderInput size={15} /> Přesunout do
          </div>
          {targets.map((category) => (
            <button
              key={category.id}
              role="menuitem"
              className="yt-menu-sub"
              onClick={() => act(() => onMove(menu.video.id, category.id!))}
            >
              {category.name}
            </button>
          ))}
        </>
      )}
      {menu.video.online && (
        <button role="menuitem" onClick={() => act(() => onDownload(menu.video))}>
          <Download size={15} /> Stáhnout do počítače
        </button>
      )}
      {!menu.video.online && menu.video.youtubeId && (
        <button
          role="menuitem"
          title="Soubor videa půjde do Koše, zůstane odkaz – přehraje se z YouTube"
          onClick={() =>
            confirmingOnline ? act(() => onKeepOnline(menu.video.id)) : setConfirmingOnline(true)
          }
        >
          <Cloud size={15} />{' '}
          {confirmingOnline
            ? `Opravdu? Soubor (${formatSize(menu.video.sizeBytes)}) půjde do Koše`
            : `Ponechat jen online (uvolní ${formatSize(menu.video.sizeBytes)})`}
        </button>
      )}
      {menu.video.youtubeId && (
        <button
          role="menuitem"
          onClick={() =>
            act(() =>
              window.open(`https://www.youtube.com/watch?v=${menu.video.youtubeId}`, '_blank')
            )
          }
        >
          <ExternalLink size={15} /> Otevřít na YouTube
        </button>
      )}
      <button
        role="menuitem"
        className="yt-menu-danger"
        onClick={() => (confirming ? act(() => onTrash(menu.video.id)) : setConfirming(true))}
      >
        <Trash2 size={15} /> {confirming ? 'Opravdu smazat do Koše?' : 'Smazat do Koše'}
      </button>
    </div>
  )
}
