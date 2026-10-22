import { Play } from 'lucide-react'
import type { MovieItem } from '../../../shared/catalog'
import { formatSize } from '../../../shared/library'
import { placeholderStyle, useCatalog } from './useCatalog'

export default function MoviesPage({
  onError
}: {
  onError: (message: string) => void
}): React.JSX.Element {
  const { movies, loading } = useCatalog()

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
          <MovieCard key={movie.id} movie={movie} onError={onError} />
        ))}
      </div>
    </div>
  )
}

function MovieCard({
  movie,
  onError
}: {
  movie: MovieItem
  onError: (message: string) => void
}): React.JSX.Element {
  const playable = movie.files.find((file) => file.available)

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
        <b>{movie.name}</b>
        <span>
          {movie.year ?? 'rok neznámý'}
          {movie.files.length > 1 && ` · ${movie.files.length} soubory`}
        </span>
        <div className="tags">
          {movie.tags.map((tag) => (
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
        </div>
        <small className="file-hint" title={movie.files.map((f) => f.relativePath).join('\n')}>
          {movie.files[0]?.fileName} · {formatSize(movie.files.reduce((sum, f) => sum + f.size, 0))}
        </small>
      </div>
    </article>
  )
}
