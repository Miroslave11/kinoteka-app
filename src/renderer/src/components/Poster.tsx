import { CircleHelp, Play } from 'lucide-react'
import { useNavigate } from 'react-router'
import { applyPalette, paletteFor, placeholderStyle } from '../app/palette'
import { displayName, displayYear, filesOf, playableFile, type TitleItem } from '../app/catalogData'
import Artwork from './Artwork'
import ImdbBadge from './ImdbBadge'

interface PosterProps {
  title: TitleItem
  /** Najetí myší přebarví prostředí podle titulu (Domů). */
  tintOnHover?: boolean
  onHoverEnd?: () => void
}

export const titlePath = (title: TitleItem): string =>
  title.kind === 'movie' ? `/filmy/${title.id}` : `/serialy/${title.id}`

/** Plakát z TMDB (nebo zástupný přechod) s názvem; klik otevře detail. */
export default function Poster({ title, tintOnHover, onHoverEnd }: PosterProps): React.JSX.Element {
  const navigate = useNavigate()
  const files = filesOf(title)
  const summary = (playableFile(files) ?? files[0])?.summary
  const name = displayName(title)
  const year = displayYear(title)
  const poster = title.metadata?.posterUrl
  const subtitle =
    title.kind === 'movie'
      ? (year ?? '')
      : `${title.episodeCount} ${title.episodeCount >= 5 ? 'dílů' : title.episodeCount === 1 ? 'díl' : 'díly'}`

  return (
    <button
      className={`poster-card ${playableFile(files) ? '' : 'is-unavailable'}`}
      onClick={() => navigate(titlePath(title))}
      onMouseEnter={tintOnHover ? () => applyPalette(paletteFor(title.name)) : undefined}
      onMouseLeave={onHoverEnd}
    >
      <span className={`poster ${poster ? 'has-art' : ''}`} style={placeholderStyle(title.name)}>
        <Artwork src={poster} alt={name} />
        {summary && (
          <span className="poster-badges">
            <span className="badge glass">{summary.resolution}</span>
          </span>
        )}
        {title.matchStatus === 'unmatched' && (
          <span className="poster-flag" title="Na TMDB se nenašel – otevři detail a oprav shodu">
            <CircleHelp size={14} /> Nedohledáno
          </span>
        )}
        {!poster && (
          <span className="poster-title">
            {name}
            <small>{subtitle}</small>
          </span>
        )}
        <span className="poster-play">
          <Play size={22} fill="currentColor" />
        </span>
      </span>
      <span className="cap">
        <b>{name}</b>
        <span>
          {year ?? 'rok neznámý'}
          {title.kind === 'show' && ` · ${subtitle}`}
          {title.imdb && <ImdbBadge imdb={title.imdb} compact />}
        </span>
      </span>
    </button>
  )
}
