import { Info, Play } from 'lucide-react'
import { useParams } from 'react-router'
import { formatSize } from '../../../shared/library'
import { canResume, remainingText } from '../../../shared/playback'
import { formatTime } from '../../../shared/player'
import { useApp } from '../app/AppContext'
import { playableFile, watchedTitle, type TitleItem } from '../app/catalogData'
import { titlePalette, useAmbientPalette } from '../app/palette'
import DetailHeader from '../components/DetailHeader'
import MediaBadges from '../components/MediaBadges'

export default function MovieDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const { movies, loading, play, showDetails } = useApp()
  const movie = movies.find((m) => m.id === Number(id))
  useAmbientPalette(movie ? titlePalette(movie) : null)

  if (!movie) {
    return (
      <div className="page">
        <p className="empty">{loading ? 'Načítám…' : 'Film už v knihovně není.'}</p>
      </div>
    )
  }

  const title: TitleItem = { kind: 'movie', ...movie }
  const file = playableFile(movie.files)
  const first = file ?? movie.files[0]
  const runtime = first?.summary
    ? formatTime(first.summary.durationSec)
    : movie.metadata?.runtimeMin && `${movie.metadata.runtimeMin} min`

  return (
    <div className="detail-page">
      <DetailHeader
        title={title}
        meta={[
          runtime,
          canResume(movie.watch.progress) && `rozkoukáno, ${remainingText(movie.watch.progress)}`,
          movie.watch.watchCount > 0 && watchedTitle(movie.watch).toLowerCase()
        ]}
        badges={<MediaBadges file={first} tags={movie.tags} />}
      >
        <button className="btn primary" disabled={!file} onClick={() => file && void play(file.id)}>
          <Play size={18} fill="currentColor" /> {file ? 'Přehrát' : 'Soubor nedostupný'}
        </button>
        {first && (
          <button className="btn" onClick={() => showDetails(first.id)}>
            <Info size={18} /> Vlastnosti souboru
          </button>
        )}
      </DetailHeader>

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
