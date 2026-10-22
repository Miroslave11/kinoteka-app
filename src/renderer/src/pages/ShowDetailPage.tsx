import { useState } from 'react'
import { Info, Play } from 'lucide-react'
import { useParams } from 'react-router'
import { formatTime } from '../../../shared/player'
import { useApp } from '../app/AppContext'
import {
  mergeSeasons,
  playableFile,
  showFiles,
  type EpisodeView,
  type TitleItem
} from '../app/catalogData'
import { paletteFor, placeholderStyle, useAmbientPalette } from '../app/palette'
import Artwork from '../components/Artwork'
import DetailHeader from '../components/DetailHeader'
import MediaBadges from '../components/MediaBadges'

const pad = (n: number): string => String(n).padStart(2, '0')

export default function ShowDetailPage(): React.JSX.Element {
  const { id } = useParams()
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

  const title: TitleItem = { kind: 'show', ...show }
  const seasons = mergeSeasons(show)
  // Výchozí série = první, ve které je něco na disku.
  const season =
    seasons.find((s) => s.number === seasonNumber) ??
    seasons.find((s) => s.episodes.some((e) => e.disk)) ??
    seasons[0]
  const firstEpisode = seasons
    .flatMap((s) => s.episodes)
    .find((e) => e.disk && playableFile(e.disk.files))
  const tags = [...new Set(showFiles(show).flatMap((f) => f.tags))]
  const total = seasons.reduce((sum, s) => sum + s.episodes.length, 0)

  return (
    <div className="detail-page">
      <DetailHeader
        title={title}
        meta={[
          `${seasons.length} ${seasons.length >= 5 ? 'sérií' : 'série'}`,
          show.metadata
            ? `${show.episodeCount} z ${total} dílů na disku`
            : `${show.episodeCount} ${show.episodeCount >= 5 ? 'dílů' : 'díly'} na disku`
        ]}
        badges={<MediaBadges file={undefined} tags={tags} />}
      >
        {firstEpisode?.disk && (
          <button
            className="btn primary"
            onClick={() => void play(playableFile(firstEpisode.disk!.files)!.id)}
          >
            <Play size={18} fill="currentColor" /> Přehrát S{pad(firstEpisode.season)}E
            {pad(firstEpisode.episode)}
          </button>
        )}
      </DetailHeader>

      {show.alternativeNames.length > 0 && (
        <p className="d-section info-chip">
          Soubory seskupené z různých názvů: {[show.name, ...show.alternativeNames].join(' / ')}
        </p>
      )}

      <section className="d-section">
        <div className="seasons">
          {seasons.map((s) => (
            <button
              key={s.number}
              className={`chip ${s.number === season?.number ? 'on' : ''}`}
              onClick={() => setSeasonNumber(s.number)}
            >
              {s.name}
              <span className="chip-count">
                {s.episodes.filter((e) => e.disk).length}/{s.episodes.length}
              </span>
            </button>
          ))}
        </div>
        {season?.episodes.map((episode) => (
          <EpisodeRow
            key={`${episode.season}x${episode.episode}`}
            showName={show.name}
            episode={episode}
          />
        ))}
      </section>
    </div>
  )
}

function EpisodeRow({
  showName,
  episode
}: {
  showName: string
  episode: EpisodeView
}): React.JSX.Element {
  const { play, showDetails } = useApp()
  const files = episode.disk?.files ?? []
  const file = playableFile(files)
  const first = file ?? files[0]

  return (
    <div className={`ep ${episode.disk ? (file ? '' : 'is-unavailable') : 'is-missing'}`}>
      <button
        className="ep-still"
        style={placeholderStyle(`${showName} ${episode.season}x${episode.episode}`)}
        disabled={!file}
        onClick={() => file && void play(file.id)}
        title={file ? 'Přehrát' : episode.disk ? 'Soubor není dostupný' : 'Díl není na disku'}
      >
        <Artwork src={episode.stillUrl} />
        {file && (
          <span className="ep-play">
            <Play size={20} fill="currentColor" />
          </span>
        )}
      </button>
      <div className="ep-info">
        <h5>
          {episode.episode}. {episode.name ?? 'díl'}
        </h5>
        {episode.overview && <p className="ep-overview">{episode.overview}</p>}
        {episode.disk ? (
          <>
            <MediaBadges file={first} tags={first?.tags ?? []} />
            <small className="mono">{files.map((f) => f.fileName).join(' · ')}</small>
          </>
        ) : (
          <small>Tento díl na disku není.</small>
        )}
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
