import { useEffect } from 'react'

/** Po otevření stránky chvíli ticho – při rychlém proklikávání melodie nezačne. */
const START_DELAY_MS = 1500
const FADE_IN_MS = 1500
const FADE_OUT_MS = 800
/** Konec melodie (stažená je useknutá po 90 s) se nechá doznít. */
const END_FADE_S = 3

/**
 * Ústřední melodie na stránce filmu nebo seriálu. Hraje potichu a jednou; zeslábne při
 * odchodu ze stránky, při spuštění filmu i při minimalizaci okna (a už se nevrátí).
 * `version` se mění po výběru jiné melodie – začne hrát ta nová.
 */
export default function ThemeMusic({
  titleId,
  version
}: {
  titleId: number
  version: number
}): null {
  useEffect(() => {
    const { theme } = window.kinoteka
    let audio: HTMLAudioElement | null = null
    let fade: number | undefined
    let stopped = false

    const ramp = (player: HTMLAudioElement, to: number, ms: number, done?: () => void): void => {
      window.clearInterval(fade)
      const from = player.volume
      const start = performance.now()
      fade = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - start) / ms)
        player.volume = from + (to - from) * progress
        if (progress < 1) return
        window.clearInterval(fade)
        done?.()
      }, 40)
    }
    const release = (player: HTMLAudioElement): void => {
      player.pause()
      player.removeAttribute('src')
      player.load()
    }
    const stop = (): void => {
      if (stopped) return
      stopped = true
      window.clearTimeout(timer)
      const player = audio
      if (player) ramp(player, 0, FADE_OUT_MS, () => release(player))
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        const [settings, info] = await Promise.all([theme.getSettings(), theme.info(titleId)])
        if (stopped || document.hidden || !settings.enabled || !info?.url) return
        const player = new Audio(info.url)
        player.volume = 0
        audio = player
        const target = settings.volume / 100
        let ending = false
        player.addEventListener('timeupdate', () => {
          const left = player.duration - player.currentTime
          if (ending || stopped || !Number.isFinite(left) || left > END_FADE_S) return
          ending = true
          ramp(player, 0, left * 1000)
        })
        player.addEventListener('ended', () => release(player))
        try {
          await player.play()
        } catch {
          return
        }
        if (stopped) release(player)
        else ramp(player, target, FADE_IN_MS)
      })()
    }, START_DELAY_MS)

    const onVisibility = (): void => {
      if (document.hidden) stop()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [titleId, version])

  return null
}
