import { useState } from 'react'
import { ChevronDown, Info, Play } from 'lucide-react'
import type { EpisodeItem, ShowItem } from '../../../shared/catalog'
import { formatTime } from '../../../shared/player'
import FileDetailsDialog from './FileDetailsDialog'
import MediaBadges from './MediaBadges'
import { placeholderStyle, useCatalog } from './useCatalog'

export default function ShowsPage({
  onError
}: {
  onError: (message: string) => void
}): React.JSX.Element {
  const { shows, loading } = useCatalog()
  const [open, setOpen] = useState<number | null>(null)
  const [detailsFor, setDetailsFor] = useState<number | null>(null)

  return (
    <div className="page">
      <h1>Seriály</h1>
      <p className="subtitle">
        {shows.length} seriálů · díly seskupené podle názvů souborů a složek
      </p>
      {!loading && shows.length === 0 && <p className="empty">Žádné seriály.</p>}
      <div className="show-list">
        {shows.map((show) => (
          <ShowRow
            key={show.id}
            show={show}
            open={open === show.id}
            onToggle={() => setOpen(open === show.id ? null : show.id)}
            onError={onError}
            onDetails={setDetailsFor}
          />
        ))}
      </div>
      {detailsFor !== null && (
        <FileDetailsDialog fileId={detailsFor} onClose={() => setDetailsFor(null)} />
      )}
    </div>
  )
}

interface ShowRowProps {
  show: ShowItem
  open: boolean
  onToggle: () => void
  onError: (message: string) => void
  onDetails: (fileId: number) => void
}

function ShowRow({ show, open, onToggle, onError, onDetails }: ShowRowProps): React.JSX.Element {
  return (
    <section className={`card show ${open ? 'is-open' : ''}`}>
      <button className="show-head" onClick={onToggle} aria-expanded={open}>
        <span className="show-thumb" style={placeholderStyle(show.name)} />
        <span className="show-info">
          <b>{show.name}</b>
          <span>
            {show.year ?? 'rok neznámý'} · {show.seasons.length}{' '}
            {show.seasons.length >= 5 ? 'sérií' : 'série'} · {show.episodeCount} dílů na disku
            {show.alternativeNames.length > 0 &&
              ` · také jako: ${show.alternativeNames.join(', ')}`}
          </span>
          <span className="tags">
            {show.tags.map((tag) => (
              <span key={tag} className="badge">
                {tag}
              </span>
            ))}
          </span>
        </span>
        <ChevronDown size={20} className="chevron" />
      </button>
      {open &&
        show.seasons.map((season) => (
          <div key={season.number} className="season">
            <h3>Série {season.number}</h3>
            {season.episodes.map((episode) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                onError={onError}
                onDetails={onDetails}
              />
            ))}
          </div>
        ))}
    </section>
  )
}

interface EpisodeRowProps {
  episode: EpisodeItem
  onError: (message: string) => void
  onDetails: (fileId: number) => void
}

function EpisodeRow({ episode, onError, onDetails }: EpisodeRowProps): React.JSX.Element {
  const playable = episode.files.find((file) => file.available)
  const first = playable ?? episode.files[0]
  const play = async (): Promise<void> => {
    if (!playable) return
    const result = await window.kinoteka.player.playFile(playable.id)
    if (!result.ok && result.reason === 'error') onError(result.message)
  }

  return (
    <div className={`episode ${playable ? '' : 'is-unavailable'}`}>
      <button
        className="icon-btn sm"
        disabled={!playable}
        onClick={() => void play()}
        title="Přehrát"
      >
        <Play size={14} fill="currentColor" />
      </button>
      <div className="episode-info">
        <b>
          {episode.episode}. díl{episode.name && ` – ${episode.name}`}
          {first?.summary && (
            <span className="muted"> · {formatTime(first.summary.durationSec)}</span>
          )}
        </b>
        <small>{episode.files.map((file) => file.fileName).join(' · ')}</small>
      </div>
      <MediaBadges file={first} tags={first?.tags ?? []} />
      {first && (
        <button
          className="icon-btn xs"
          title="Vlastnosti souboru"
          onClick={() => onDetails(first.id)}
        >
          <Info size={14} />
        </button>
      )}
    </div>
  )
}
