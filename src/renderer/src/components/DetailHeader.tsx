import { useState } from 'react'
import { ArrowLeft, ExternalLink, Link2, MonitorPlay, RefreshCw, SearchCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { displayName, displayYear, type TitleItem } from '../app/catalogData'
import { placeholderStyle } from '../app/palette'
import Artwork from './Artwork'
import CsfdLinkDialog from './CsfdLinkDialog'
import CsfdRating from './CsfdRating'
import FixMatchDialog from './FixMatchDialog'

interface DetailHeaderProps {
  title: TitleItem
  /** Doplňující řádek pod názvem (délka, počet dílů…). */
  meta: (string | number | null | undefined | false)[]
  badges: React.ReactNode
  /** Hlavní tlačítka (Přehrát…). */
  children: React.ReactNode
}

const STATUS_TEXT: Record<string, string> = {
  pending: 'Údaje z TMDB se dohledávají…',
  unmatched: 'Na TMDB se nenašel žádný odpovídající titul.',
  error: 'Údaje z TMDB se nepodařilo načíst, zkusí se znovu.'
}

/** Horní část detailu filmu i seriálu: pozadí, plakát, logo/název, údaje z TMDB a ČSFD. */
export default function DetailHeader({
  title,
  meta,
  badges,
  children
}: DetailHeaderProps): React.JSX.Element {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'fix' | 'csfd' | null>(null)
  const { metadata, csfd } = title
  const name = displayName(title)
  const original =
    metadata?.originalName ??
    csfd?.originalName ??
    (title.kind === 'show' ? title.alternativeNames[0] : null)
  // Žánry a země z ČSFD jsou česky a přesnější, jinak z TMDB.
  const genres = csfd?.genres.length ? csfd.genres : (metadata?.genres ?? [])
  const country = csfd?.countries[0] ?? metadata?.countries[0]
  const allMeta = [displayYear(title), ...meta, ...genres.slice(0, 3), country]
    .filter(Boolean)
    .join(' · ')
  const plot = csfd?.plot ?? metadata?.overview
  const plotSource = csfd?.plot ? 'ČSFD' : metadata?.overview ? 'TMDB' : null

  const refresh = (): void => {
    void window.kinoteka.metadata.refresh(title.id)
    void window.kinoteka.csfd.refresh(title.id)
  }

  return (
    <>
      <div className="d-back">
        <div className="clip" />
        <Artwork src={metadata?.backdropUrl} className="backdrop" />
        <div className="shade" />
      </div>
      <button className="icon-btn back" onClick={() => navigate(-1)} title="Zpět">
        <ArrowLeft size={20} />
      </button>

      <div className="detail">
        <div
          className={`poster detail-poster ${metadata?.posterUrl ? 'has-art' : ''}`}
          style={placeholderStyle(title.name)}
        >
          <Artwork src={metadata?.posterUrl} alt={name} />
          {!metadata?.posterUrl && (
            <span className="poster-title">
              {name}
              <small>{displayYear(title)}</small>
            </span>
          )}
        </div>

        <div className="d-info">
          {metadata?.logoUrl ? (
            <h1 className="logo-image">
              <img src={metadata.logoUrl} alt={name} />
            </h1>
          ) : (
            <h1 className="logo-title">{name}</h1>
          )}
          {original && <div className="orig">{original}</div>}
          <div className="meta">{allMeta}</div>
          <div className="ratings">
            {csfd && <CsfdRating csfd={csfd} />}
            {metadata?.rating && (
              <span className="tmdb">
                TMDB {metadata.rating.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}
              </span>
            )}
            {badges}
          </div>
          <div className="actions">
            {children}
            {metadata?.trailerUrl && (
              <a className="btn" href={metadata.trailerUrl} target="_blank" rel="noreferrer">
                <MonitorPlay size={18} /> Trailer
              </a>
            )}
          </div>

          {STATUS_TEXT[title.matchStatus] && (
            <p className="notice">{STATUS_TEXT[title.matchStatus]}</p>
          )}
          {metadata?.tagline && <p className="tagline">„{metadata.tagline}“</p>}
          {plot && (
            <p className="plot">
              {plot}
              {plotSource && <span className="source"> ({plotSource})</span>}
            </p>
          )}

          <div className="detail-links">
            <button className="link" onClick={() => setDialog('fix')}>
              <SearchCheck size={15} /> Opravit shodu
            </button>
            {(metadata || csfd) && (
              <button className="link" onClick={refresh}>
                <RefreshCw size={15} /> Znovu načíst údaje
              </button>
            )}
            {csfd ? (
              <a className="link" href={csfd.url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> ČSFD
              </a>
            ) : null}
            <button className="link" onClick={() => setDialog('csfd')}>
              <Link2 size={15} /> {csfd ? 'Změnit propojení s ČSFD' : 'Propojit s ČSFD'}
            </button>
            {metadata && (
              <a className="link" href={metadata.tmdbUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> TMDB
              </a>
            )}
          </div>
          {title.csfdStatus === 'notfound' && (
            <p className="muted small">
              ČSFD se automaticky nenašlo – vlož odkaz přes „Propojit s ČSFD“.
            </p>
          )}
        </div>
      </div>

      {metadata && (metadata.directors.length > 0 || metadata.cast.length > 0) && (
        <section className="d-section people">
          {metadata.directors.length > 0 && (
            <div className="person">
              <span className="avatar" />
              <div>
                <b>{metadata.directors.join(', ')}</b>
                <span>{title.kind === 'movie' ? 'Režie' : 'Tvůrci'}</span>
              </div>
            </div>
          )}
          {metadata.cast.slice(0, 10).map((person) => (
            <div key={person.name} className="person">
              <span className="avatar" style={placeholderStyle(person.name)}>
                <Artwork src={person.photoUrl} alt={person.name} />
              </span>
              <div>
                <b>{person.name}</b>
                {person.role && <span>{person.role}</span>}
              </div>
            </div>
          ))}
        </section>
      )}

      {dialog === 'fix' && <FixMatchDialog title={title} onClose={() => setDialog(null)} />}
      {dialog === 'csfd' && <CsfdLinkDialog title={title} onClose={() => setDialog(null)} />}
    </>
  )
}
