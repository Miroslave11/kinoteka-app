import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Play } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { formatTime } from '../../../shared/player'
import { countOf } from '../../../shared/plural'
import type { YtCategory, YtVideoSummary } from '../../../shared/yt'
import { useApp } from '../app/AppContext'
import { placeholderStyle, useAmbientPalette } from '../app/palette'
import Artwork from '../components/Artwork'
import { continueRow, filterKey, totalVideos, visibleCategories } from './ytData'

/** Obrázek videa: uložený vedle videa (nebo snímek z něj), jinak náhled z YouTube. */
const imageOf = (video: YtVideoSummary): string | null =>
  video.thumbnailUrl ?? (video.youtubeId ? `kinoteka-media://ytthumb/${video.youtubeId}` : null)

function VideoCard({
  video,
  detail,
  onPlay
}: {
  video: YtVideoSummary
  detail: string | null
  onPlay: (id: number) => void
}): React.JSX.Element {
  return (
    <button
      className="land yt-card"
      onClick={() => onPlay(video.id)}
      title={video.progress !== null ? 'Pokračovat' : 'Přehrát'}
    >
      <span className="land-img" style={placeholderStyle(video.name)}>
        <Artwork src={imageOf(video)} />
        <span className="land-play">
          <Play size={22} fill="currentColor" />
        </span>
        {video.durationSec !== null && (
          <span className="badge glass yt-length">{formatTime(video.durationSec)}</span>
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

/** Stránka YT videa: Pokračovat, filtr kategorií a řady videí po kategoriích. */
export default function YtPage(): React.JSX.Element {
  const { setError } = useApp()
  const { yt } = window.kinoteka
  const [categories, setCategories] = useState<YtCategory[] | null>(null)
  const [params, setParams] = useSearchParams()
  useAmbientPalette(null)

  const reload = useCallback(async () => setCategories(await yt.listCategories()), [yt])
  useEffect(() => {
    void reload()
    return yt.onChanged(() => void reload())
  }, [yt, reload])

  const visible = useMemo(() => visibleCategories(categories ?? []), [categories])
  const continuing = useMemo(() => continueRow(visible), [visible])
  const selected = visible.find((category) => filterKey(category) === params.get('kategorie'))
  const total = totalVideos(visible)

  const play = (id: number): void =>
    void yt.playVideo(id).then((result) => {
      if (!result.ok && result.reason === 'error') setError(result.message)
    })
  const select = (category: YtCategory | null): void =>
    setParams(category ? { kategorie: filterKey(category) } : {}, { replace: true })

  if (categories !== null && total === 0) {
    return (
      <div className="page empty-home">
        <h1>YT videa</h1>
        <p className="subtitle">
          Zatím tu nejsou žádná videa. Vlož je do složky s YT videi – zařadí se samy do kategorií
          podle obsahu.
        </p>
        <Link className="btn primary" to="/nastaveni?sekce=yt">
          Nastavení YT videí
        </Link>
      </div>
    )
  }

  return (
    <div className="page yt-page">
      <h1>YT videa</h1>
      <p className="subtitle">
        {countOf(total, 'video', 'videa', 'videí')} ·{' '}
        {countOf(
          visible.filter((c) => c.id !== null).length,
          'kategorie',
          'kategorie',
          'kategorií'
        )}
      </p>

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
        <div className="yt-grid">
          {selected.videos.map((video) => (
            <VideoCard key={video.id} video={video} detail={video.channel} onPlay={play} />
          ))}
        </div>
      ) : (
        <>
          {continuing.length > 0 && (
            <section className="yt-row">
              <h3>Pokračovat</h3>
              <div className="strip">
                {continuing.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    detail={[video.channel, video.categoryName].filter(Boolean).join(' · ')}
                    onPlay={play}
                  />
                ))}
              </div>
            </section>
          )}
          {visible.map((category) => (
            <section key={filterKey(category)} className="yt-row">
              <h3>
                {category.name}
                <span className="muted small">{category.videos.length}</span>
                <button className="row-link" onClick={() => select(category)}>
                  Zobrazit vše
                </button>
              </h3>
              <div className="strip">
                {category.videos.map((video) => (
                  <VideoCard key={video.id} video={video} detail={video.channel} onPlay={play} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
