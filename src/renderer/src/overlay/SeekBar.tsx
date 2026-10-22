import { useRef, useState, type PointerEvent } from 'react'
import { formatTime } from '../../../shared/player'

interface SeekBarProps {
  position: number
  duration: number
  onSeek: (seconds: number) => void
}

export default function SeekBar({ position, duration, onSeek }: SeekBarProps): React.JSX.Element {
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const ratioAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (duration <= 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    setHover(ratioAt(event.clientX))
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    setHover(ratioAt(event.clientX))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    setDragging(false)
    onSeek(ratioAt(event.clientX) * duration)
  }

  const progress = duration > 0 ? (dragging && hover !== null ? hover : position / duration) : 0

  return (
    <div
      className={`seek ${dragging ? 'is-dragging' : ''}`}
      ref={track}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !dragging && setHover(null)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      role="slider"
      aria-label="Pozice"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
    >
      <div className="seek-track">
        <div className="seek-fill" style={{ width: `${progress * 100}%` }} />
        {hover !== null && <div className="seek-hover" style={{ width: `${hover * 100}%` }} />}
      </div>
      <div className="seek-knob" style={{ left: `${progress * 100}%` }} />
      {hover !== null && duration > 0 && (
        <div className="seek-tooltip" style={{ left: `${hover * 100}%` }}>
          {formatTime(hover * duration)}
        </div>
      )}
    </div>
  )
}
