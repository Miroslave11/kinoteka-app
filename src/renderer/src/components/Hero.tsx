import { Info, Play } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { formatTime } from '../../../shared/player'
import { useApp } from '../app/AppContext'
import { displayName, displayYear, filesOf, playableFile, type TitleItem } from '../app/catalogData'
import Artwork from './Artwork'
import BackgroundClips from './BackgroundClips'
import MediaBadges from './MediaBadges'
import { titlePath } from './Poster'
import { countOf } from '../../../shared/plural'

interface HeroProps {
  titles: TitleItem[]
  index: number
  onSelect: (index: number) => void
}

/**
 * Velký panel na Domů. Pozadí je obrázek z TMDB nad animovaným přechodem v barvách titulu,
 * klipy z filmu přijdou v přírůstku 8.
 */
export default function Hero({ titles, index, onSelect }: HeroProps): React.JSX.Element | null {
  const { play } = useApp()
  const navigate = useNavigate()
  const title = titles[index]
  if (!title) return null

  const files = filesOf(title)
  const file = playableFile(files)
  const first = file ?? files[0]
  const metadata = title.metadata
  const name = displayName(title)
  const meta = [
    displayYear(title),
    title.kind === 'movie'
      ? first?.summary && formatTime(first.summary.durationSec)
      : `seriál · ${countOf(title.episodeCount, 'díl', 'díly', 'dílů')} na disku`,
    ...(metadata?.genres.slice(0, 2) ?? [])
  ].filter(Boolean)
  const key = `${title.kind}-${title.id}`

  return (
    <section className="hero">
      <div className="clip" />
      <AnimatePresence>
        {metadata?.backdropUrl && (
          <motion.div
            key={key}
            className="hero-art"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
          >
            <Artwork src={metadata.backdropUrl} className="backdrop" />
          </motion.div>
        )}
      </AnimatePresence>
      <BackgroundClips clips={title.clips} />
      <div className="hero-shade" />
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          className="hero-body"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          {metadata?.logoUrl ? (
            <div className="logo-image hero-logo">
              <img src={metadata.logoUrl} alt={name} />
            </div>
          ) : (
            <div className="logo-title">{name}</div>
          )}
          <div className="meta">{meta.join(' · ')}</div>
          <MediaBadges
            file={first}
            tags={files.flatMap((f) => f.tags).filter((t, i, a) => a.indexOf(t) === i)}
          />
          {metadata?.overview && <p className="plot clamp">{metadata.overview}</p>}
          <div className="actions">
            {title.kind === 'movie' && file && (
              <button className="btn primary" onClick={() => void play(file.id)}>
                <Play size={18} fill="currentColor" /> Přehrát
              </button>
            )}
            <button className="btn" onClick={() => navigate(titlePath(title))}>
              <Info size={18} /> {title.kind === 'show' ? 'Díly' : 'Více informací'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
      {titles.length > 1 && (
        <div className="hero-dots" role="tablist" aria-label="Zvýrazněné tituly">
          {titles.map((t, i) => (
            <button
              key={`${t.kind}-${t.id}`}
              className={i === index ? 'on' : ''}
              onClick={() => onSelect(i)}
              aria-label={displayName(t)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
