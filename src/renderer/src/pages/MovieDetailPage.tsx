import { ArrowLeft, Info, Play } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { formatSize } from '../../../shared/library'
import { formatTime } from '../../../shared/player'
import { useApp } from '../app/AppContext'
import { playableFile } from '../app/catalogData'
import { paletteFor, placeholderStyle, useAmbientPalette } from '../app/palette'
import MediaBadges from '../components/MediaBadges'

export default function MovieDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const { movies, loading, play, showDetails } = useApp()
  const movie = movies.find((m) => m.id === Number(id))
  useAmbientPalette(movie ? paletteFor(movie.name) : null)

  if (!movie) {
    return (
      <div className="page">
        <p className="empty">{loading ? 'Načítám…' : 'Film už v knihovně není.'}</p>
      </div>
    )
  }

  const file = playableFile(movie.files)
  const first = file ?? movie.files[0]
  const meta = [movie.year, first?.summary && formatTime(first.summary.durationSec)].filter(Boolean)

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
        <div className="poster detail-poster" style={placeholderStyle(movie.name)}>
          <span className="poster-title">
            {movie.name}
            <small>{movie.year}</small>
          </span>
        </div>
        <div className="d-info">
          <div className="logo-title">{movie.name}</div>
          <div className="meta">{meta.join(' · ') || 'rok a délka zatím neznámé'}</div>
          <MediaBadges file={first} tags={movie.tags} />
          <div className="actions">
            <button
              className="btn primary"
              disabled={!file}
              onClick={() => file && void play(file.id)}
            >
              <Play size={18} fill="currentColor" /> {file ? 'Přehrát' : 'Soubor nedostupný'}
            </button>
            {first && (
              <button className="btn" onClick={() => showDetails(first.id)}>
                <Info size={18} /> Vlastnosti souboru
              </button>
            )}
          </div>
          <p className="plot muted">
            Popis, hodnocení ČSFD a herci přibudou s metadaty z TMDB a ČSFD.
          </p>
        </div>
      </div>

      {movie.files.length > 1 && (
        <section className="d-section card">
          <h4>Verze filmu</h4>
          {movie.files.map((f) => (
            <div key={f.id} className={`version ${f.available ? '' : 'is-unavailable'}`}>
              <button
                className="icon-btn sm"
                disabled={!f.available}
                onClick={() => void play(f.id)}
                title="Přehrát"
              >
                <Play size={14} fill="currentColor" />
              </button>
              <div>
                <b>{f.fileName}</b>
                <small>{formatSize(f.size)}</small>
              </div>
              <MediaBadges file={f} tags={f.tags} />
              <button
                className="icon-btn xs"
                onClick={() => showDetails(f.id)}
                title="Vlastnosti souboru"
              >
                <Info size={14} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
