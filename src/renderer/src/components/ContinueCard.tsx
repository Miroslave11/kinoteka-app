import { Play } from 'lucide-react'
import { progressRatio, remainingText } from '../../../shared/playback'
import { useApp } from '../app/AppContext'
import { displayName, type ContinueItem } from '../app/catalogData'
import { applyPalette, placeholderStyle, titlePalette } from '../app/palette'
import Artwork from './Artwork'

/** Karta v řadě „Pokračovat ve sledování“ – klik rovnou pokračuje bez dotazu. */
export default function ContinueCard({
  item,
  onHoverEnd
}: {
  item: ContinueItem
  onHoverEnd?: () => void
}): React.JSX.Element {
  const { play } = useApp()
  const { title, progress } = item
  const detail = progress
    ? [item.episode, remainingText(progress)].filter(Boolean).join(' · ')
    : `Další díl · ${item.episode}`

  return (
    <button
      className="land"
      onClick={() => void play(item.fileId, 'resume')}
      onMouseEnter={() => applyPalette(titlePalette(title))}
      onMouseLeave={onHoverEnd}
      title={progress ? 'Pokračovat' : 'Přehrát další díl'}
    >
      <span className="land-img" style={placeholderStyle(title.name)}>
        <Artwork src={item.imageUrl} />
        <span className="land-play">
          <Play size={22} fill="currentColor" />
        </span>
        {progress && (
          <span className="progress-bar on-image">
            <i style={{ width: `${progressRatio(progress) * 100}%` }} />
          </span>
        )}
      </span>
      <span className="cap">
        <b>{displayName(title)}</b>
        <span>{detail}</span>
      </span>
    </button>
  )
}
