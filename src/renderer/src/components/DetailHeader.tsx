import { useState } from 'react'
import { ArrowLeft, ExternalLink, MonitorPlay, Music, RefreshCw, SearchCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { IMDB_TITLE_URL } from '../../../shared/metadata'
import { displayName, displayYear, type TitleItem } from '../app/catalogData'
import { placeholderStyle } from '../app/palette'
import Artwork from './Artwork'
import BackgroundClips from './BackgroundClips'
import FixMatchDialog from './FixMatchDialog'
import ImdbBadge from './ImdbBadge'
import Stars from './Stars'
import ThemeDialog from './ThemeDialog'
import ThemeMusic from './ThemeMusic'

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

/** Horní část detailu filmu i seriálu: pozadí, plakát, logo/název, údaje z TMDB a IMDb. */
export default function DetailHeader({
  title,
  meta,
  badges,
  children
}: DetailHeaderProps): React.JSX.Element {
  const navigate = useNavigate()
  const [fixing, setFixing] = useState(false)
  const [choosingTheme, setChoosingTheme] = useState(false)
  const [themeVersion, setThemeVersion] = useState(0)
  const { metadata, imdb } = title
  const name = displayName(title)
  const original =
    metadata?.originalName ?? (title.kind === 'show' ? title.alternativeNames[0] : null)
  const allMeta = [
    displayYear(title),
    ...meta,
    ...(metadata?.genres.slice(0, 3) ?? []),
    metadata?.countries[0]
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div className="d-back">
        <div className="clip" />
        <Artwork src={metadata?.backdropUrl} className="backdrop" />
        <BackgroundClips clips={title.clips} />
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
            {imdb && <ImdbBadge imdb={imdb} />}
            {metadata?.rating && (
              <span className="tmdb">
                TMDB {metadata.rating.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}
              </span>
            )}
            {badges}
            <span className="my-rating">
              Moje hodnocení
              <Stars
                value={title.myRating}
                size={16}
                onChange={(rating) => void window.kinoteka.journal.setRating(title.id, rating)}
              />
            </span>
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
          {metadata?.overview && <p className="plot">{metadata.overview}</p>}

          <div className="detail-links">
            <button className="link" onClick={() => setFixing(true)}>
              <SearchCheck size={15} /> Opravit shodu
            </button>
            <button className="link" onClick={() => setChoosingTheme(true)}>
              <Music size={15} /> Melodie…
            </button>
            {metadata && (
              <button
                className="link"
                onClick={() => void window.kinoteka.metadata.refresh(title.id)}
              >
                <RefreshCw size={15} /> Znovu načíst údaje
              </button>
            )}
            {metadata?.imdbId && (
              <a
                className="link"
                href={`${IMDB_TITLE_URL}${metadata.imdbId}/`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> IMDb
              </a>
            )}
            {metadata && (
              <a className="link" href={metadata.tmdbUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> TMDB
              </a>
            )}
          </div>
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

      {fixing && <FixMatchDialog title={title} onClose={() => setFixing(false)} />}
      {choosingTheme && (
        <ThemeDialog
          title={title}
          onClose={() => setChoosingTheme(false)}
          onChanged={() => setThemeVersion((v) => v + 1)}
        />
      )}
      <ThemeMusic titleId={title.id} version={themeVersion} />
    </>
  )
}
