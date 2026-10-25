import { useEffect, useState } from 'react'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Má Esc opustit celou obrazovku? Jen když ho nepotřebuje nic jiného: otevřený dialog
 * (zavírá se Esc), rozepsané pole (Esc ruší úpravu) nebo jiný posluchač, který ho už zpracoval.
 */
export function escapeLeavesFullscreen(
  event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'repeat' | 'target'>,
  dialogOpen: boolean
): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || dialogOpen) return false
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null
  return !(target?.tagName && EDITABLE.has(target.tagName)) && !target?.isContentEditable
}

/** Režim hlavního okna a jeho přepínání (ikona v horní liště). */
export function useFullscreen(): [boolean, (fullscreen: boolean) => void] {
  const { appWindow } = window.kinoteka
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let active = true
    void appWindow.state().then((state) => active && setFullscreen(state.fullscreen))
    const off = appWindow.onChanged((state) => setFullscreen(state.fullscreen))
    return () => {
      active = false
      off()
    }
  }, [appWindow])

  return [fullscreen, (value) => void appWindow.setFullscreen(value)]
}

/** Esc opustí celou obrazovku (F11 přepíná v hlavním procesu). */
export function useEscapeLeavesFullscreen(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const dialogOpen = document.querySelector('[role="dialog"]') !== null
      if (!escapeLeavesFullscreen(event, dialogOpen)) return
      void window.kinoteka.appWindow.setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
