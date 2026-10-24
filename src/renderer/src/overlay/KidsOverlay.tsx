import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import { useEffect, useState } from 'react'
import { ArrowLeft, Heart, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import type { KidsPlayerInfo, PlayerCommand, PlayerState } from '../../../shared/player'
import { useIdle } from './useIdle'

const HIDE_CONTROLS_AFTER_MS = 3000
/** Po konci pohádky se další spustí sama po tolika sekundách (je-li to zapnuté). */
const NEXT_COUNTDOWN_SECONDS = 5

const send = (command: PlayerCommand): void => window.kinoteka.player.send(command)

/**
 * Dětské ovládání přehrávače: jen velká tlačítka (zpět, předchozí, pauza, další, srdíčko)
 * a tlustý proužek času. Žádné stopy, titulky ani klávesové zkratky navíc.
 */
export default function KidsOverlay({
  state,
  kids
}: {
  state: PlayerState
  kids: KidsPlayerInfo
}): React.JSX.Element {
  const [idle, wake] = useIdle(HIDE_CONTROLS_AFTER_MS, !state.paused && !state.ended)
  const [countdown, setCountdown] = useState<number | null>(null)

  const autoNext = state.ended && kids.next !== null && kids.autoplayNext
  useEffect(() => {
    if (!autoNext) {
      setCountdown(null)
      return
    }
    setCountdown(NEXT_COUNTDOWN_SECONDS)
    const timer = window.setInterval(
      () => setCountdown((value) => (value === null ? null : value - 1)),
      1000
    )
    return () => window.clearInterval(timer)
  }, [autoNext])
  useEffect(() => {
    if (countdown === 0) send({ type: 'play-next' })
  }, [countdown])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      wake()
      const command: PlayerCommand | null =
        event.key === ' '
          ? { type: 'toggle-pause' }
          : event.key === 'Escape'
            ? { type: 'escape' }
            : event.key === 'ArrowLeft'
              ? { type: 'seek-relative', seconds: -10 }
              : event.key === 'ArrowRight'
                ? { type: 'seek-relative', seconds: 10 }
                : null
      if (command) {
        event.preventDefault()
        send(command)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wake])

  const ratio = state.duration > 0 ? Math.min(1, state.position / state.duration) : 0
  const stop = (event: React.MouseEvent): void => event.stopPropagation()

  return (
    <div
      className={`kids-overlay ${idle ? 'is-idle' : ''}`}
      onMouseMove={wake}
      onClick={() => send({ type: 'toggle-pause' })}
      onDoubleClick={() => send({ type: 'toggle-fullscreen' })}
    >
      <header className="ko-top" onClick={stop} onDoubleClick={stop}>
        <button className="ko-round ko-back" title="Zpět" onClick={() => send({ type: 'close' })}>
          <ArrowLeft size={36} strokeWidth={2.8} />
        </button>
        <h1>{state.title}</h1>
      </header>

      {state.ended && (
        <div className="ko-ended" onClick={stop} onDoubleClick={stop}>
          {kids.next ? (
            <>
              <span className="ko-next-label">
                {countdown !== null && countdown > 0
                  ? `Další pohádka za ${countdown} s`
                  : 'Další pohádka'}
              </span>
              <button className="ko-next" onClick={() => send({ type: 'play-next' })}>
                <span
                  className="ko-next-thumb"
                  style={
                    kids.next.thumbnailUrl
                      ? { backgroundImage: `url("${kids.next.thumbnailUrl}")` }
                      : undefined
                  }
                />
                <b>{kids.next.name}</b>
                <span className="ko-round ko-play-small">
                  <Play size={28} fill="currentColor" strokeWidth={0} />
                </span>
              </button>
            </>
          ) : (
            <span className="ko-next-label">Konec pohádky</span>
          )}
          <div className="ko-ended-actions">
            <button
              className="ko-pill"
              onClick={() => {
                send({ type: 'seek-absolute', seconds: 0 })
                send({ type: 'set-pause', paused: false })
              }}
            >
              <RotateCcw size={24} strokeWidth={2.6} /> Ještě jednou
            </button>
            <button className="ko-pill" onClick={() => send({ type: 'close' })}>
              <ArrowLeft size={24} strokeWidth={2.6} /> Zpět
            </button>
          </div>
        </div>
      )}

      <footer className="ko-bottom" onClick={stop} onDoubleClick={stop}>
        <div
          className="ko-track"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const seconds = ((event.clientX - box.left) / box.width) * state.duration
            if (state.duration > 0) send({ type: 'seek-absolute', seconds })
          }}
        >
          <i style={{ width: `${ratio * 100}%` }} />
          <b style={{ left: `${ratio * 100}%` }} />
        </div>
        <div className="ko-controls">
          <button
            className="ko-round"
            title="Předchozí pohádka"
            disabled={!kids.hasPrevious}
            onClick={() => send({ type: 'play-previous' })}
          >
            <SkipBack size={40} fill="currentColor" strokeWidth={2.4} />
          </button>
          <button
            className="ko-round ko-main"
            title={state.paused ? 'Přehrát' : 'Pauza'}
            onClick={() => send({ type: 'toggle-pause' })}
          >
            {state.paused ? (
              <Play size={58} fill="currentColor" strokeWidth={0} style={{ marginLeft: 6 }} />
            ) : (
              <Pause size={58} fill="currentColor" strokeWidth={0} />
            )}
          </button>
          <button
            className="ko-round"
            title="Další pohádka"
            disabled={kids.next === null}
            onClick={() => send({ type: 'play-next' })}
          >
            <SkipForward size={40} fill="currentColor" strokeWidth={2.4} />
          </button>
          <button
            className={`ko-round ko-heart ${kids.favorite ? 'is-on' : ''}`}
            title={kids.favorite ? 'Oblíbená pohádka' : 'Přidat do oblíbených'}
            onClick={() => send({ type: 'toggle-favorite' })}
          >
            <Heart size={34} fill={kids.favorite ? 'currentColor' : 'none'} strokeWidth={2.6} />
          </button>
        </div>
      </footer>
    </div>
  )
}
