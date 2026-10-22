import { useState } from 'react'
import { ArrowLeft, Info, Play } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import type { EpisodeItem } from '../../../shared/catalog'
import { formatTime } from '../../../shared/player'
import { useApp } from '../app/AppContext'
import { playableFile, showFiles } from '../app/catalogData'
import { paletteFor, placeholderStyle, useAmbientPalette } from '../app/palette'
import MediaBadges from '../components/MediaBadges'

export default function ShowDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const { shows, loading, play } = useApp()
  const show = shows.find((s) => s.id === Number(id))
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null)
  useAmbientPalette(show ? paletteFor(show.name) : null)

  if (!show) {
    return (
      <div className="page">
        <p className="empty">{loading ? 'Načítám…' : 'Seriál už v knihovně není.'}</p>
      </div>
    )
  }

  const season = show.seasons.find((s) => s.number === seasonNumber) ?? show.seasons[0]
  const firstEpisode = show.seasons[0]?.episodes.find((e) => playableFile(e.files))
  const files = showFiles(show)
  const tags = [...new Set(files.flatMap((f) => f.tags))]

  return (
    <div className="detail-page">
      <div className="d-back">
        <div className="clip" />
        <div className="shade" />
      </div>
      <button className="icon-btn back" onClick={() => navigate(-1)} title="Zpět">
        <ArrowLeft size={20} />
      </button>
      <div className="detail">
        <div className="poster detail-poster" style={placeholderStyle(show.name)}>
          <span className="poster-title">
            {show.name}
            <small>{show.year}</small>
          </span>
        </div>
        <div className="d-info">
          <div className="logo-title">{show.name}</div>
          {show.alternativeNames.length > 0 && (
            <div className="orig">také jako {show.alternativeNames.join(', ')}</div>
          )}
          <div className="meta">
            {[
              show.year ?? 'rok neznámý',
              `${show.seasons.length} ${show.seasons.length >= 5 ? 'sérií' : 'série'}`,
              `${show.episodeCount} ${show.episodeCount >= 5 ? 'dílů' : 'díly'} na disku`
            ].join(' · ')}
          </div>
          <MediaBadges file={undefined} tags={tags} />
          {show.alternativeNames.length > 0 && (
            <div className="info-chip">
              Seskupeno ze souborů s různými názvy:{' '}
              {[show.name, ...show.alternativeNames].join(' / ')}
            </div>
          )}
          <div className="actions">
            {firstEpisode && (
              <button
                className="btn primary"
                onClick={() => void play(playableFile(firstEpisode.files)!.id)}
              >
                <Play size={18} fill="currentColor" /> Přehrát S
                {String(firstEpisode.season).padStart(2, '0')}E
                {String(firstEpisode.episode).padStart(2, '0')}
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="d-section">
        <div className="seasons">
          {show.seasons.map((s) => (
            <button
              key={s.number}
              className={`chip ${s.number === season?.number ? 'on' : ''}`}
              onClick={() => setSeasonNumber(s.number)}
            >
              Série {s.number}
            </button>
          ))}
        </div>
        {season?.episodes.map((episode) => (
          <EpisodeRow key={episode.id} name={show.name} episode={episode} />
        ))}
      </section>
    </div>
  )
}

function EpisodeRow({ name, episode }: { name: string; episode: EpisodeItem }): React.JSX.Element {
  const { play, showDetails } = useApp()
  const file = playableFile(episode.files)
  const first = file ?? episode.files[0]

  return (
    <div className={`ep ${file ? '' : 'is-unavailable'}`}>
      <button
        className="ep-still"
        style={placeholderStyle(`${name} ${episode.season}x${episode.episode}`)}
        disabled={!file}
        onClick={() => file && void play(file.id)}
        title="Přehrát"
      >
        <span className="ep-play">
          <Play size={20} fill="currentColor" />
        </span>
      </button>
      <div className="ep-info">
        <h5>
          {episode.episode}. {episode.name ?? 'díl'}
        </h5>
        <MediaBadges file={first} tags={first?.tags ?? []} />
        <small className="mono">{episode.files.map((f) => f.fileName).join(' · ')}</small>
      </div>
      <div className="ep-side">
        {first?.summary && <span>{formatTime(first.summary.durationSec)}</span>}
        {first && (
          <button
            className="icon-btn xs"
            onClick={() => showDetails(first.id)}
            title="Vlastnosti souboru"
          >
            <Info size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
