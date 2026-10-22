import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX
} from 'lucide-react'
import {
  formatTime,
  INITIAL_PLAYER_STATE,
  type PlayerCommand,
  type PlayerState
} from '../../../shared/player'
import SeekBar from './SeekBar'
import { useIdle } from './useIdle'

const HIDE_CONTROLS_AFTER_MS = 2500
/** Odstup, podle kterého se rozliší jedno kliknutí (pauza) od dvojkliku (celá obrazovka). */
const DOUBLE_CLICK_MS = 250

const send = (command: PlayerCommand): void => window.kinoteka.player.send(command)

function endsAt(state: PlayerState): string {
  const remaining = Math.max(0, state.duration - state.position)
  const end = new Date(Date.now() + remaining * 1000)
  return end.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
}

export default function PlayerOverlay(): React.JSX.Element {
  const [state, setState] = useState<PlayerState>(INITIAL_PLAYER_STATE)
  const [overControls, setOverControls] = useState(false)
  const [idle, wake] = useIdle(
    HIDE_CONTROLS_AFTER_MS,
    !state.paused && !state.ended && !overControls
  )
  const clickTimer = useRef<number | undefined>(undefined)

  useEffect(() => window.kinoteka.player.onState(setState), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      wake()
      const command = keyToCommand(event, state)
      if (command) {
        event.preventDefault()
        send(command)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, wake])

  const onSurfaceClick = (): void => {
    window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(() => send({ type: 'toggle-pause' }), DOUBLE_CLICK_MS)
  }
  const onSurfaceDoubleClick = (): void => {
    window.clearTimeout(clickTimer.current)
    send({ type: 'toggle-fullscreen' })
  }

  const passthrough = state.audio?.passthrough === true
  const controlsProps = {
    onMouseEnter: () => setOverControls(true),
    onMouseLeave: () => setOverControls(false),
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onDoubleClick: (event: React.MouseEvent) => event.stopPropagation()
  }

  return (
    <div
      className={`overlay ${idle ? 'is-idle' : ''}`}
      onMouseMove={wake}
      onClick={onSurfaceClick}
      onDoubleClick={onSurfaceDoubleClick}
    >
      <header className="top" {...controlsProps}>
        <button className="icon-btn" title="Zpět (Esc)" onClick={() => send({ type: 'close' })}>
          <ArrowLeft size={20} />
        </button>
        <div className="title">{state.title}</div>
        <span className="spacer" />
        {state.audio && (
          <span
            className={`pill ${passthrough ? 'ok' : ''}`}
            title={
              passthrough
                ? 'Zvuk jde nedekódovaný do receiveru, ten by měl ukazovat Dolby / DTS.'
                : 'Zvuk dekóduje počítač a posílá ho jako PCM.'
            }
          >
            {passthrough
              ? `● Bitstream ${state.audio.codec} ${state.audio.channels} → HDMI`
              : `PCM · ${state.audio.codec} ${state.audio.channels}`}
          </span>
        )}
        {state.video && (
          <span className="pill">
            {state.video.codec} {state.video.width}×{state.video.height}
          </span>
        )}
      </header>

      {state.ended && (
        <div className="ended" {...controlsProps}>
          <div className="ended-title">Konec</div>
          <div className="ended-actions">
            <button
              className="btn primary"
              onClick={() => {
                send({ type: 'seek-absolute', seconds: 0 })
                send({ type: 'set-pause', paused: false })
              }}
            >
              <Play size={18} fill="currentColor" /> Přehrát znovu
            </button>
            <button className="btn" onClick={() => send({ type: 'close' })}>
              Zavřít
            </button>
          </div>
        </div>
      )}

      <footer className="bottom" {...controlsProps}>
        <SeekBar
          position={state.position}
          duration={state.duration}
          onSeek={(seconds) => send({ type: 'seek-absolute', seconds })}
        />
        <div className="controls">
          <div className="time">
            {formatTime(state.position)} / {formatTime(state.duration)}
            {state.duration > 0 && <span className="ends"> · konec v {endsAt(state)}</span>}
          </div>
          <div className="center">
            <button
              className="icon-btn"
              title="Zpět o 10 s (←)"
              onClick={() => send({ type: 'seek-relative', seconds: -10 })}
            >
              <RotateCcw size={20} />
            </button>
            <button
              className="big-btn"
              title="Přehrát / pauza (mezerník)"
              onClick={() => send({ type: 'toggle-pause' })}
            >
              {state.paused ? (
                <Play size={26} fill="currentColor" />
              ) : (
                <Pause size={26} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-btn"
              title="Vpřed o 30 s (→ = 10 s)"
              onClick={() => send({ type: 'seek-relative', seconds: 30 })}
            >
              <RotateCw size={20} />
            </button>
          </div>
          <div className="right">
            <div
              className={`volume ${passthrough ? 'is-disabled' : ''}`}
              title={
                passthrough ? 'Při passthrough ovládá hlasitost receiver.' : 'Hlasitost (↑ ↓, M)'
              }
            >
              <button
                className="icon-btn"
                disabled={passthrough}
                onClick={() => send({ type: 'toggle-mute' })}
              >
                {state.muted || state.volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={state.muted ? 0 : Math.round(state.volume)}
                disabled={passthrough}
                onChange={(event) =>
                  send({ type: 'set-volume', volume: Number(event.target.value) })
                }
                aria-label="Hlasitost"
              />
            </div>
            <button
              className="icon-btn"
              title="Celá obrazovka (F, dvojklik)"
              onClick={() => send({ type: 'toggle-fullscreen' })}
            >
              {state.fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function keyToCommand(event: KeyboardEvent, state: PlayerState): PlayerCommand | null {
  switch (event.key) {
    case ' ':
    case 'k':
    case 'K':
      return { type: 'toggle-pause' }
    case 'ArrowLeft':
      return { type: 'seek-relative', seconds: -10 }
    case 'ArrowRight':
      return { type: 'seek-relative', seconds: 10 }
    case 'ArrowUp':
      return { type: 'set-volume', volume: state.volume + 5 }
    case 'ArrowDown':
      return { type: 'set-volume', volume: state.volume - 5 }
    case 'm':
    case 'M':
      return { type: 'toggle-mute' }
    case 'f':
    case 'F':
      return { type: 'toggle-fullscreen' }
    case 'Escape':
      return { type: 'escape' }
    default:
      return null
  }
}
