import { useState } from 'react'
import { Info, Play } from 'lucide-react'
import type { MovieItem } from '../../../shared/catalog'
import { formatSize } from '../../../shared/library'
import { formatTime } from '../../../shared/player'
import FileDetailsDialog from './FileDetailsDialog'
import MediaBadges from './MediaBadges'
import { placeholderStyle, useCatalog } from './useCatalog'

export default function MoviesPage({
  onError
}: {
  onError: (message: string) => void
}): React.JSX.Element {
  const { movies, loading } = useCatalog()
  const [detailsFor, setDetailsFor] = useState<number | null>(null)

  return (
    <div className="page">
      <h1>Filmy</h1>
      <p className="subtitle">
        {movies.length} filmů · rozpoznáno z názvů souborů, obrázky a popisy přibudou s metadaty
      </p>
      {!loading && movies.length === 0 && (
        <p className="empty">Žádné filmy. Přidej složku na záložce Knihovna.</p>
      )}
      <div className="poster-grid">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} onError={onError} onDetails={setDetailsFor} />
        ))}
      </div>
      {detailsFor !== null && (
        <FileDetailsDialog fileId={detailsFor} onClose={() => setDetailsFor(null)} />
      )}
    </div>
  )
}

interface MovieCardProps {
  movie: MovieItem
  onError: (message: string) => void
  onDetails: (fileId: number) => void
}

function MovieCard({ movie, onError, onDetails }: MovieCardProps): React.JSX.Element {
  const playable = movie.files.find((file) => file.available)
  const first = playable ?? movie.files[0]

  const play = async (): Promise<void> => {
    if (!playable) return
    const result = await window.kinoteka.player.playFile(playable.id)
    if (!result.ok && result.reason === 'error') onError(result.message)
  }

  return (
    <article className={`poster-card ${playable ? '' : 'is-unavailable'}`}>
      <button
        className="poster"
        style={placeholderStyle(movie.name)}
        onClick={() => void play()}
        disabled={!playable}
      >
        <span className="poster-title">
          {movie.name}
          {movie.year && <small>{movie.year}</small>}
        </span>
        {playable && (
          <span className="poster-play">
            <Play size={22} fill="currentColor" />
          </span>
        )}
      </button>
      <div className="poster-caption">
        <div className="caption-head">
          <b>{movie.name}</b>
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
        <span>
          {movie.year ?? 'rok neznámý'}
          {first?.summary && ` · ${formatTime(first.summary.durationSec)}`}
          {movie.files.length > 1 && ` · ${movie.files.length} soubory`}
        </span>
        <MediaBadges file={first} tags={movie.tags} />
        <small className="file-hint" title={movie.files.map((f) => f.relativePath).join('\n')}>
          {first?.fileName} · {formatSize(movie.files.reduce((sum, f) => sum + f.size, 0))}
        </small>
      </div>
    </article>
  )
}
