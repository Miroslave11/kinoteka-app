import { Info, Play } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { formatTime } from '../../../shared/player'
import { useApp } from '../app/AppContext'
import { filesOf, playableFile, type TitleItem } from '../app/catalogData'
import MediaBadges from './MediaBadges'
import { titlePath } from './Poster'

interface HeroProps {
  titles: TitleItem[]
  index: number
  onSelect: (index: number) => void
}

/** Velký panel na Domů. Pozadí je zatím animovaný přechod v barvách titulu, klipy přijdou v přírůstku 8. */
export default function Hero({ titles, index, onSelect }: HeroProps): React.JSX.Element | null {
  const { play } = useApp()
  const navigate = useNavigate()
  const title = titles[index]
  if (!title) return null

  const files = filesOf(title)
  const file = playableFile(files)
  const first = file ?? files[0]
  const meta = [
    title.year,
    title.kind === 'movie'
      ? first?.summary && formatTime(first.summary.durationSec)
      : `seriál · ${title.episodeCount} ${title.episodeCount >= 5 ? 'dílů' : 'díly'} na disku`
  ].filter(Boolean)

  return (
    <section className="hero">
      <div className="clip" />
      <div className="hero-shade" />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${title.kind}-${title.id}`}
          className="hero-body"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <div className="logo-title">{title.name}</div>
          <div className="meta">{meta.join(' · ')}</div>
          <MediaBadges
            file={first}
            tags={files.flatMap((f) => f.tags).filter((t, i, a) => a.indexOf(t) === i)}
          />
          <p className="plot muted">Popis a hodnocení z ČSFD a TMDB přibudou s metadaty.</p>
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
              aria-label={t.name}
            />
          ))}
        </div>
      )}
    </section>
  )
}
