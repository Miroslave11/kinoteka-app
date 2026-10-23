/** Délka jednoho klipu na pozadí v sekundách. */
export const CLIP_SECONDS = 8

/**
 * Kde z filmu vyříznout klipy na pozadí. Vynechá začátek (loga, úvodní titulky)
 * i konec (závěrečné titulky) a klipy rozprostře rovnoměrně mezi.
 */
export function chooseClipTimes(durationSec: number, count = 3, length = CLIP_SECONDS): number[] {
  if (!Number.isFinite(durationSec) || durationSec < length * 4) return []
  const start = durationSec * 0.15
  const end = durationSec * 0.8 - length
  if (end <= start) return [Math.floor(durationSec / 2 - length / 2)]
  const clips = Math.max(1, Math.min(count, Math.floor((end - start) / (length * 3)) + 1))
  if (clips === 1) return [Math.floor((start + end) / 2)]
  const step = (end - start) / (clips - 1)
  return Array.from({ length: clips }, (_, i) => Math.floor(start + step * i))
}
