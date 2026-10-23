import { useEffect } from 'react'
import type { Palette } from '../../../shared/posterPalette'

export type { Palette }

export const DEFAULT_PALETTE: Palette = { c1: '#8a2a12', c2: '#2a0d1c', accent: '#ff8a3d' }

function hashHue(name: string): number {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0
  return Math.abs(hash) % 360
}

/** Náhradní paleta odvozená z názvu – pro tituly bez plakátu nebo s černobílým plakátem. */
export function paletteFor(name: string): Palette {
  const hue = hashHue(name)
  return {
    c1: `hsl(${hue} 70% 30%)`,
    c2: `hsl(${(hue + 40) % 360} 55% 10%)`,
    accent: `hsl(${hue} 95% 64%)`
  }
}

/** Zástupný „plakát“ – barevný přechod v barvách titulu. */
export function placeholderStyle(name: string): React.CSSProperties {
  const hue = hashHue(name)
  return {
    background: `radial-gradient(120% 80% at 30% 0%, hsl(${hue} 70% 45% / 0.9), transparent 60%),
      linear-gradient(165deg, hsl(${hue} 55% 22%), hsl(${(hue + 40) % 360} 50% 8%))`
  }
}

export function applyPalette(palette: Palette): void {
  const root = document.documentElement.style
  root.setProperty('--c1', palette.c1)
  root.setProperty('--c2', palette.c2)
  root.setProperty('--accent', palette.accent)
}

/** Přebarví celé prostředí podle zobrazeného titulu; bez titulu vrátí výchozí barvy. */
export function useAmbientPalette(palette: Palette | null): void {
  const key = palette ? `${palette.c1}|${palette.c2}|${palette.accent}` : ''
  useEffect(() => {
    applyPalette(palette ?? DEFAULT_PALETTE)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paleta je určená klíčem
  }, [key])
}

/** Barvy titulu: z plakátu, jinak náhradní z názvu. */
export function titlePalette(title: { name: string; palette: Palette | null }): Palette {
  return title.palette ?? paletteFor(title.name)
}
