import { useCallback, useEffect, useRef, useState } from 'react'

/** true, když se myš ani klávesnice delší dobu nepohnuly. */
export function useIdle(timeoutMs: number, enabled: boolean): [idle: boolean, wake: () => void] {
  const [idle, setIdle] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const wake = useCallback(() => {
    setIdle(false)
    window.clearTimeout(timer.current)
    if (enabled) timer.current = window.setTimeout(() => setIdle(true), timeoutMs)
  }, [enabled, timeoutMs])

  useEffect(() => {
    wake()
    return () => window.clearTimeout(timer.current)
  }, [wake])

  return [idle && enabled, wake]
}
