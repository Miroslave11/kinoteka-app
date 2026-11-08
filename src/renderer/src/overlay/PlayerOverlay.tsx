import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Subtitles,
  Keyboard,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX
} from 'lucide-react'
import {
  formatTime,
  INITIAL_PLAYER_STATE,
  type PlayerCommand,
  type PlayerState
} from '../../../shared/player'
import BusyIndicator from './BusyIndicator'
import KidsOverlay from './KidsOverlay'
import SeekBar from './SeekBar'
import OnlineSubtitlesPanel from './OnlineSubtitlesPanel'
import ShortcutHelp from './ShortcutHelp'
import TrackPanel from './TrackPanel'
import { useIdle } from './useIdle'

const HIDE_CONTROLS_AFTER_MS = 2500
/** Po konci dílu se další díl spustí sám po tolika sekundách. */
const NEXT_COUNTDOWN_SECONDS = 10
const NOTICE_MS = 10_000
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
  const [panelOpen, setPanelOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [idle, wake] = useIdle(
    HIDE_CONTROLS_AFTER_MS,
    !state.paused && !state.ended && !overControls && !panelOpen
  )
  const clickTimer = useRef<number | undefined>(undefined)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => window.kinoteka.player.onState(setState), [])

  // Upozornění z přehrávače (např. přechod na PCM) se na chvíli ukáže nahoře.
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    setNotice(state.notice)
    if (!state.notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [state.notice])

  // Konec dílu: odpočet do dalšího dílu (zruší ho návrat, nové přehrání nebo „Zrušit“).
  const offerNext = state.ended && state.next !== null
  useEffect(() => {
    if (!offerNext) {
      setCountdown(null)
      return
    }
    setCountdown(NEXT_COUNTDOWN_SECONDS)
    const timer = window.setInterval(
      () => setCountdown((value) => (value === null ? null : value - 1)),
      1000
    )
    return () => window.clearInterval(timer)
  }, [offerNext])
  useEffect(() => {
    if (countdown === 0) send({ type: 'play-next' })
  }, [countdown])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      wake()
      if (event.key === 'Escape' && (panelOpen || helpOpen || onlineOpen)) {
        event.preventDefault()
        setHelpOpen(false)
        setOnlineOpen(false)
        return setPanelOpen(false)
      }
      if (event.key === '?') {
        event.preventDefault()
        return setHelpOpen((open) => !open)
      }
      const command = keyToCommand(event, state)
      if (command) {
        event.preventDefault()
        send(command)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, wake, panelOpen, helpOpen, onlineOpen])

  const onSurfaceClick = (): void => {
    window.clearTimeout(clickTimer.current)
    // Klik mimo otevřený panel stop ho jen zavře.
    if (panelOpen) return setPanelOpen(false)
    clickTimer.current = window.setTimeout(() => send({ type: 'toggle-pause' }), DOUBLE_CLICK_MS)
  }
  const onSurfaceDoubleClick = (): void => {
    window.clearTimeout(clickTimer.current)
    send({ type: 'toggle-fullscreen' })
  }

  const passthrough = state.audio?.passthrough === true
  if (state.kids) return <KidsOverlay state={state} kids={state.kids} />

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

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {onlineOpen && <OnlineSubtitlesPanel onClose={() => setOnlineOpen(false)} />}

      <BusyIndicator text={state.ended ? null : state.busy} />

      {notice && (
        <div className="notice-toast" {...controlsProps}>
          {notice}
        </div>
      )}

      {state.ended && (
        <div className="ended" {...controlsProps}>
          <div className="ended-title">{state.next ? 'Konec dílu' : 'Konec'}</div>
          {state.next && <div className="ended-next">Další díl: {state.next}</div>}
          <div className="ended-actions">
            {state.next && (
              <button className="btn primary" onClick={() => send({ type: 'play-next' })}>
                <SkipForward size={18} fill="currentColor" />
                {countdown !== null && countdown > 0
                  ? `Další díl za ${countdown} s`
                  : 'Přehrát další díl'}
              </button>
            )}
            <button
              className={`btn ${state.next ? '' : 'primary'}`}
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
          {countdown !== null && countdown > 0 && (
            <button className="link-btn" onClick={() => setCountdown(null)}>
              Zrušit odpočet
            </button>
          )}
        </div>
      )}

      <footer className="bottom" {...controlsProps}>
        {panelOpen && (
          <TrackPanel
            audioTracks={state.audioTracks}
            subtitleTracks={state.subtitleTracks}
            subDelay={state.subDelay}
            onAudio={(id) => send({ type: 'set-audio-track', id })}
            onSubtitle={(id) => send({ type: 'set-subtitle-track', id })}
            onDelay={(seconds) => send({ type: 'set-sub-delay', seconds })}
            onLoadSubtitle={() => send({ type: 'load-subtitle' })}
            onSearchOnline={() => {
              setPanelOpen(false)
              setOnlineOpen(true)
            }}
          />
        )}
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
            {state.previous && (
              <button
                className="icon-btn"
                title={`Předchozí díl: ${state.previous} (P)`}
                onClick={() => send({ type: 'play-previous' })}
              >
                <SkipBack size={20} />
              </button>
            )}
            <button
              className="icon-btn"
              title="Zpět o 10 s (←)"
              onClick={() => send({ type: 'seek-relative', seconds: -10 })}
            >
              <RotateCcw size={20} />
            </button>
            <button
              className="icon-btn"
              title="Zastavit – příště od začátku"
              onClick={() => send({ type: 'stop' })}
            >
              <Square size={18} fill="currentColor" />
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
            {state.next && (
              <button
                className="icon-btn"
                title={`Další díl: ${state.next} (N)`}
                onClick={() => send({ type: 'play-next' })}
              >
                <SkipForward size={20} />
              </button>
            )}
          </div>
          <div className="right">
            <button
              className={`icon-btn ${panelOpen ? 'is-on' : ''}`}
              title="Zvuk a titulky (A, S)"
              onClick={() => setPanelOpen((open) => !open)}
            >
              <Subtitles size={20} />
            </button>
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
              className={`icon-btn ${helpOpen ? 'is-on' : ''}`}
              title="Klávesové zkratky (?)"
              onClick={() => setHelpOpen((open) => !open)}
            >
              <Keyboard size={20} />
            </button>
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
    case 'j':
    case 'J':
      return { type: 'seek-relative', seconds: -10 }
    case 'ArrowRight':
    case 'l':
    case 'L':
      return { type: 'seek-relative', seconds: 10 }
    case 'Home':
      return { type: 'seek-absolute', seconds: 0 }
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      // Skok na desetiny délky (5 = polovina), jako na YouTube.
      return state.duration > 0
        ? { type: 'seek-absolute', seconds: (state.duration * Number(event.key)) / 10 }
        : null
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
    case 'a':
    case 'A': {
      // Přepne na další zvukovou stopu dokola.
      const tracks = state.audioTracks
      if (tracks.length < 2) return null
      const current = tracks.findIndex((t) => t.selected)
      return { type: 'set-audio-track', id: tracks[(current + 1) % tracks.length]!.id }
    }
    case 's':
    case 'S': {
      // Titulky dokola: vypnuté → stopy → vypnuté.
      const tracks = state.subtitleTracks
      if (tracks.length === 0) return null
      const current = tracks.findIndex((t) => t.selected)
      const next = tracks[current + 1]
      return { type: 'set-subtitle-track', id: next ? next.id : null }
    }
    case 'z':
    case 'Z':
      return { type: 'set-sub-delay', seconds: state.subDelay - 0.1 }
    case 'x':
    case 'X':
      return { type: 'set-sub-delay', seconds: state.subDelay + 0.1 }
    case 'n':
    case 'N':
      return state.next ? { type: 'play-next' } : null
    case 'p':
    case 'P':
      return state.previous ? { type: 'play-previous' } : null
    case 'Escape':
      return { type: 'escape' }
    default:
      return null
  }
}
