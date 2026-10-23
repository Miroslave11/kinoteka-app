import { useEffect } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { progressRatio, type PlaybackProgress, type StartFrom } from '../../../shared/playback'
import { formatTime } from '../../../shared/player'

/** „Pokračovat ve sledování?“ – před přehráním rozkoukaného filmu nebo dílu. */
export default function ResumeDialog({
  label,
  progress,
  onChoose,
  onClose
}: {
  label: string
  progress: PlaybackProgress
  onChoose: (from: StartFrom) => void
  onClose: () => void
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const at = formatTime(progress.position)
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog resume-dialog"
        role="dialog"
        aria-label="Pokračovat ve sledování?"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Pokračovat ve sledování?</h3>
        <p className="muted">
          {label} – minule jsi skončil v <b>{at}</b> ze {formatTime(progress.duration)}.
        </p>
        <div className="progress-bar">
          <i style={{ width: `${progressRatio(progress) * 100}%` }} />
        </div>
        <div className="dialog-foot">
          <button className="btn sm" onClick={() => onChoose('beginning')}>
            <RotateCcw size={16} /> Od začátku
          </button>
          <button className="btn sm primary" autoFocus onClick={() => onChoose('resume')}>
            <Play size={16} fill="currentColor" /> Pokračovat od {at}
          </button>
        </div>
      </div>
    </div>
  )
}
