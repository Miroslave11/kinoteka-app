import { Check, CircleHelp, Play } from 'lucide-react'
import { useNavigate } from 'react-router'
import { canResume, progressRatio } from '../../../shared/playback'
import { applyPalette, placeholderStyle, titlePalette } from '../app/palette'
import {
  displayName,
  displayYear,
  filesOf,
  playableFile,
  upNext,
  watchedTitle,
  type TitleItem
} from '../app/catalogData'
import Artwork from './Artwork'
import ImdbBadge from './ImdbBadge'
import { countOf } from '../../../shared/plural'

interface PosterProps {
  title: TitleItem
  /** Najetí myší přebarví prostředí podle titulu (Domů). */
  tintOnHover?: boolean
  onHoverEnd?: () => void
}

export const titlePath = (title: TitleItem): string =>
  title.kind === 'movie' ? `/filmy/${title.id}` : `/serialy/${title.id}`

/**
 * Značky na plakátu: fajfka u zhlédnutého filmu nebo seriálu, kde jsou zhlédnuté všechny
 * díly na disku; proužek u rozkoukaného filmu nebo dílu.
 */
function posterWatch(title: TitleItem): { watched: string | null; progress: number | null } {
  if (title.kind === 'movie') {
    return {
      watched: title.watch.watchCount > 0 ? watchedTitle(title.watch) : null,
      progress: canResume(title.watch.progress) ? progressRatio(title.watch.progress) : null
    }
  }
  const episodes = title.seasons.flatMap((s) => s.episodes)
  const all = episodes.length > 0 && episodes.every((e) => e.watch.watchCount > 0)
  const next = upNext(title)
  return {
    watched: all ? 'Všechny díly na disku zhlédnuté' : null,
    progress:
      next?.mode === 'resume' && next.episode.watch.progress
        ? progressRatio(next.episode.watch.progress)
        : null
  }
}

/** Plakát z TMDB (nebo zástupný přechod) s názvem; klik otevře detail. */
export default function Poster({ title, tintOnHover, onHoverEnd }: PosterProps): React.JSX.Element {
  const navigate = useNavigate()
  const files = filesOf(title)
  const summary = (playableFile(files) ?? files[0])?.summary
  const name = displayName(title)
  const year = displayYear(title)
  const poster = title.metadata?.posterUrl
  const subtitle =
    title.kind === 'movie' ? (year ?? '') : countOf(title.episodeCount, 'díl', 'díly', 'dílů')
  const { watched, progress } = posterWatch(title)

  return (
    <button
      className={`poster-card ${playableFile(files) ? '' : 'is-unavailable'}`}
      onClick={() => navigate(titlePath(title))}
      onMouseEnter={tintOnHover ? () => applyPalette(titlePalette(title)) : undefined}
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
        {watched && (
          <span className="poster-watched" title={watched}>
            <Check size={14} strokeWidth={3} />
          </span>
        )}
        <span className="poster-play">
          <Play size={22} fill="currentColor" />
        </span>
        {progress !== null && (
          <span className="progress-bar on-image">
            <i style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </span>
      <span className="cap">
        <b>{name}</b>
        <span>
          {year ?? 'rok neznámý'}
          {title.kind === 'show' && ` · ${subtitle}`}
          {title.imdb && <ImdbBadge imdb={title.imdb} compact />}
          {title.myRating && (
            <span className="my-stars" title={`Moje hodnocení ${title.myRating} z 5`}>
              ★ {title.myRating}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
