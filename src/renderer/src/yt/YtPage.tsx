import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Play,
  Plus
} from 'lucide-react'
import { formatSize } from '../../../shared/library'
import { Link, useSearchParams } from 'react-router'
import { formatTime } from '../../../shared/player'
import { countOf } from '../../../shared/plural'
import type { YtCategory, YtVideoSummary } from '../../../shared/yt'
import { useApp } from '../app/AppContext'
import { placeholderStyle, useAmbientPalette } from '../app/palette'
import Artwork from '../components/Artwork'
import YtDownload from './YtDownload'
import YtVideoMenu, { type YtMenuState } from './YtVideoMenu'
import {
  continueRow,
  diskBytes,
  filterKey,
  freeableBytes,
  totalVideos,
  visibleCategories
} from './ytData'

/** Obrázek videa: uložený vedle videa (nebo snímek z něj), jinak náhled z YouTube. */
const imageOf = (video: YtVideoSummary): string | null =>
  video.thumbnailUrl ?? (video.youtubeId ? `kinoteka-media://ytthumb/${video.youtubeId}` : null)

function VideoCard({
  video,
  detail,
  onPlay,
  onMenu
}: {
  video: YtVideoSummary
  detail: string | null
  onPlay: (id: number) => void
  onMenu: (video: YtVideoSummary, x: number, y: number) => void
}): React.JSX.Element {
  const hover = useRef<number | null>(null)
  const stopHover = (): void => {
    if (hover.current !== null) window.clearTimeout(hover.current)
    hover.current = null
  }
  useEffect(() => stopHover, [])
  return (
    <button
      className="land yt-card"
      onClick={() => onPlay(video.id)}
      // Online video: po chvilce nad kartou se adresy z YouTube zjistí předem.
      onMouseEnter={() => {
        if (!video.online || video.unavailable) return
        stopHover()
        hover.current = window.setTimeout(() => void window.kinoteka.yt.prefetch(video.id), 300)
      }}
      onMouseLeave={stopHover}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(video, event.clientX, event.clientY)
      }}
      title={video.progress !== null ? 'Pokračovat' : 'Přehrát'}
    >
      <span className="land-img" style={placeholderStyle(video.name)}>
        <Artwork src={imageOf(video)} />
        <span
          className="yt-more"
          role="button"
          aria-label="Další možnosti"
          title="Další možnosti"
          onClick={(event) => {
            event.stopPropagation()
            const box = event.currentTarget.getBoundingClientRect()
            onMenu(video, box.left, box.bottom + 4)
          }}
        >
          <MoreHorizontal size={18} />
        </span>
        <span className="land-play">
          <Play size={22} fill="currentColor" />
        </span>
        {video.durationSec !== null && (
          <span className="badge glass yt-length">{formatTime(video.durationSec)}</span>
        )}
        <span
          className={`badge glass yt-storage ${video.online ? 'is-online' : ''}`}
          title={video.online ? 'Online – přehrává se z YouTube' : 'Stažené v počítači'}
        >
          {video.online ? <Cloud size={12} /> : <HardDrive size={12} />}
          {video.online ? 'Online' : 'V počítači'}
        </span>
        {video.unavailable && (
          <span className="badge glass yt-unavailable" title="YouTube video už nevydá">
            <AlertTriangle size={12} /> Nedostupné
          </span>
        )}
        {video.watched && video.progress === null && (
          <span className="yt-watched" title="Zhlédnuto">
            <CheckCircle2 size={18} />
          </span>
        )}
        {video.progress !== null && (
          <span className="progress-bar on-image">
            <i style={{ width: `${video.progress * 100}%` }} />
          </span>
        )}
      </span>
      <span className="cap">
        <b>{video.name}</b>
        {detail && <span>{detail}</span>}
      </span>
    </button>
  )
}

/** „Ponechat jen online“ pro celou kategorii – na druhé kliknutí, ukáže uvolněné místo. */
function FreeSpaceButton({
  category,
  onFree
}: {
  category: YtCategory
  onFree: (categoryId: number) => void
}): React.JSX.Element | null {
  const [confirming, setConfirming] = useState(false)
  const bytes = freeableBytes(category)
  if (bytes === 0 || category.id === null) return null
  return (
    <button
      className={`row-link yt-free ${confirming ? 'is-confirming' : ''}`}
      title="Stažená videa půjdou do Koše, zůstanou jako online (přehrají se z YouTube)"
      onBlur={() => setConfirming(false)}
      onClick={() => (confirming ? onFree(category.id!) : setConfirming(true))}
    >
      <Cloud size={14} />{' '}
      {confirming
        ? `Opravdu? ${formatSize(bytes)} půjde do Koše`
        : `Ponechat jen online (uvolní ${formatSize(bytes)})`}
    </button>
  )
}

/** Stránka YT videa: Pokračovat, filtr kategorií a řady videí po kategoriích. */
export default function YtPage(): React.JSX.Element {
  const { setError } = useApp()
  const { yt } = window.kinoteka
  const [categories, setCategories] = useState<YtCategory[] | null>(null)
  const [params, setParams] = useSearchParams()
  const [downloading, setDownloading] = useState(false)
  const [menu, setMenu] = useState<YtMenuState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useAmbientPalette(null)

  const reload = useCallback(async () => setCategories(await yt.listCategories()), [yt])
  useEffect(() => {
    void reload()
    return yt.onChanged(() => void reload())
  }, [yt, reload])

  const visible = useMemo(() => visibleCategories(categories ?? []), [categories])
  const everything = totalVideos(categories ?? [])
  const continuing = useMemo(() => continueRow(visible), [visible])
  const selected = visible.find((category) => filterKey(category) === params.get('kategorie'))
  const total = totalVideos(visible)

  /** Online video, které se právě načítá z YouTube (hláška se spinnerem). */
  const [loading, setLoading] = useState<string | null>(null)
  const play = (id: number): void => {
    const video = (categories ?? []).flatMap((c) => c.videos).find((v) => v.id === id)
    // Hláška až po chvilce – z mezipaměti se video spustí hned a jen by problikla.
    const timer = video?.online ? window.setTimeout(() => setLoading(video.name), 250) : null
    void yt
      .playVideo(id)
      .then((result) => {
        if (!result.ok && result.reason === 'error') setError(result.message)
      })
      .finally(() => {
        if (timer !== null) window.clearTimeout(timer)
        setLoading(null)
      })
  }
  // První online video v řadě Pokračovat se připraví hned po otevření stránky.
  const firstOnline = continuing.find((v) => v.online && !v.unavailable)?.id ?? null
  useEffect(() => {
    if (firstOnline !== null) void yt.prefetch(firstOnline)
  }, [yt, firstOnline])
  const manage = (action: Parameters<typeof yt.manage>[0]): void =>
    void yt.manage(action).then((result) => {
      if (!result.ok) setError(result.message)
      else if (result.freedBytes)
        setNotice(`Uvolněno ${formatSize(result.freedBytes)} – soubory jsou v Koši.`)
    })
  /** Online video → stáhnout do počítače (do jeho kategorie). */
  const download = async (video: YtVideoSummary): Promise<void> => {
    if (!video.youtubeId) return
    const owner = (categories ?? []).find((c) => c.videos.some((v) => v.id === video.id))
    const { quality } = await yt.status()
    const result = await yt.enqueue({
      kind: 'video',
      videoId: video.youtubeId,
      playlistId: null,
      title: owner?.id != null ? owner.name : '',
      quality
    })
    if (!result.ok) return setError(result.message)
    setNotice(
      result.added > 0
        ? `„${video.name}“ se stahuje do počítače – průběh je v okně Přidat z YouTube.`
        : 'Video už je stažené.'
    )
  }
  const openMenu = (video: YtVideoSummary, x: number, y: number): void => {
    const owner = (categories ?? []).find((c) => c.videos.some((v) => v.id === video.id))
    setMenu({ video, categoryId: owner?.id ?? null, x, y })
  }
  const closeMenu = useCallback(() => setMenu(null), [])
  const select = (category: YtCategory | null): void =>
    setParams(category ? { kategorie: filterKey(category) } : {}, { replace: true })

  const dialog = downloading && (
    <YtDownload categories={categories ?? []} onClose={() => setDownloading(false)} />
  )
  const downloadButton = (
    <button className="btn primary" onClick={() => setDownloading(true)}>
      <Plus size={16} /> Přidat z YouTube
    </button>
  )

  if (categories !== null && everything === 0) {
    return (
      <div className="page empty-home">
        <h1>YT videa</h1>
        <p className="subtitle">
          Zatím tu nejsou žádná videa. Stáhni je odkazem z YouTube, nebo je vlož do složky s YT
          videi – zařadí se samy do kategorií podle obsahu.
        </p>
        <div className="actions">
          {downloadButton}
          <Link className="btn" to="/nastaveni?sekce=yt">
            Nastavení YT videí
          </Link>
        </div>
        {dialog}
      </div>
    )
  }

  return (
    <div className="page yt-page">
      <div className="yt-head">
        <div>
          <h1>YT videa</h1>
          <p className="subtitle">
            {countOf(total, 'video', 'videa', 'videí')} ·{' '}
            {countOf(
              visible.filter((c) => c.id !== null).length,
              'kategorie',
              'kategorie',
              'kategorií'
            )}
            {diskBytes(categories ?? []) > 0 &&
              ` · v počítači ${formatSize(diskBytes(categories ?? []))}`}
          </p>
        </div>
        {downloadButton}
      </div>
      {notice && (
        <p className="notice yt-notice" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}

      <div className="toolbar yt-chips">
        <button className={`chip ${selected ? '' : 'on'}`} onClick={() => select(null)}>
          Vše <span className="chip-count">{total}</span>
        </button>
        {visible.map((category) => (
          <button
            key={filterKey(category)}
            className={`chip ${selected === category ? 'on' : ''}`}
            onClick={() => select(category)}
          >
            {category.name} <span className="chip-count">{category.videos.length}</span>
          </button>
        ))}
      </div>

      {selected ? (
        <>
          <div className="yt-grid-head">
            <FreeSpaceButton
              category={selected}
              onFree={(categoryId) => manage({ kind: 'keep-online-category', categoryId })}
            />
          </div>
          <div className="yt-grid">
            {selected.videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                detail={video.channel}
                onPlay={play}
                onMenu={openMenu}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          {continuing.length > 0 && (
            <section className="yt-row">
              <h3>Pokračovat</h3>
              <div className="yt-grid">
                {continuing.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    detail={[video.channel, video.categoryName].filter(Boolean).join(' · ')}
                    onPlay={play}
                    onMenu={openMenu}
                  />
                ))}
              </div>
            </section>
          )}
          {visible.map((category) => (
            <section key={filterKey(category)} className="yt-row">
              <h3>
                {category.name}
                <span className="yt-count" title="Počet videí">
                  {category.videos.length}
                </span>
                <button className="row-link" onClick={() => select(category)}>
                  Zobrazit vše
                </button>
                <FreeSpaceButton
                  category={category}
                  onFree={(categoryId) => manage({ kind: 'keep-online-category', categoryId })}
                />
              </h3>
              <div className="yt-grid">
                {category.videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    detail={video.channel}
                    onPlay={play}
                    onMenu={openMenu}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      {dialog}
      {loading && (
        <div className="yt-loading" role="status" aria-live="polite">
          <div className="yt-loading-card">
            <Loader2 size={36} className="spin" />
            <b>Načítám video z YouTube…</b>
            <span className="muted small">{loading}</span>
          </div>
        </div>
      )}
      {menu && (
        <YtVideoMenu
          menu={menu}
          categories={categories ?? []}
          onPlay={play}
          onMove={(videoId, categoryId) => manage({ kind: 'move-video', videoId, categoryId })}
          onTrash={(videoId) => manage({ kind: 'trash-video', videoId })}
          onKeepOnline={(videoId) => manage({ kind: 'keep-online', videoId })}
          onDownload={(video) => void download(video)}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
