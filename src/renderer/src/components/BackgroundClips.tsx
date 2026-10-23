import { useEffect, useRef, useState } from 'react'

/** Jak dlouho před koncem klipu začne prolínání do dalšího (s). */
const FADE_SECONDS = 0.7

const reducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Tiché klipy z filmu na pozadí. Střídají se dokola s prolnutím přes obrázek pod nimi;
 * když okno není vidět (běží přehrávač, aplikace je v pozadí), video stojí.
 */
export default function BackgroundClips({ clips }: { clips: string[] }): React.JSX.Element | null {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const key = clips.join('|')

  // Jiný titul = začít od prvního klipu.
  useEffect(() => {
    setIndex(0)
    setVisible(false)
  }, [key])

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.hidden) video.current?.pause()
      else void video.current?.play().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (clips.length === 0 || reducedMotion()) return null
  const src = clips[index % clips.length]!
  const next = (): void => {
    setVisible(false)
    setIndex((i) => (i + 1) % clips.length)
  }

  return (
    <video
      ref={video}
      key={src}
      className={`bg-clip ${visible ? 'on' : ''}`}
      src={src}
      autoPlay
      muted
      playsInline
      preload="auto"
      onPlaying={() => setVisible(true)}
      onTimeUpdate={(event) => {
        const { duration, currentTime } = event.currentTarget
        if (duration - currentTime < FADE_SECONDS) setVisible(false)
      }}
      onEnded={next}
      onError={() => (clips.length > 1 ? next() : setVisible(false))}
    />
  )
}
