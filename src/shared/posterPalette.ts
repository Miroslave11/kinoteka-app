/** Stav klipů na pozadí (Nastavení → Vzhled). */
export interface PreviewStatus {
  clipsEnabled: boolean
  /** Soubory, které ještě čekají na klipy. */
  pending: number
  working: boolean
}

/** Barvy prostředí: dvě barvy pozadí a akcent (tlačítka, časová osa, zvýraznění). */
export interface Palette {
  c1: string
  c2: string
  accent: string
}

interface Hsl {
  h: number
  s: number
  l: number
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: h * 60, s, l }
}

const hsl = (h: number, s: number, l: number): string =>
  `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`

const HUE_BUCKETS = 24
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * Paleta z pixelů plakátu (RGB, 3 bajty na pixel). Akcent je nejvýraznější barva, která
 * na plakátu zabírá rozumnou plochu; pozadí jsou její tmavé odstíny, aby byl text čitelný.
 * Plakát bez barev (černobílý) vrátí null – použije se náhradní paleta.
 */
export function paletteFromPixels(rgb: Uint8Array): Palette | null {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, x: 0, y: 0, s: 0, n: 0 }))
  let colorful = 0
  const pixels = Math.floor(rgb.length / 3)
  for (let i = 0; i < pixels; i++) {
    const { h, s, l } = rgbToHsl(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!)
    // Téměř šedé, černé a bílé pixely barvu prostředí neurčují.
    if (s < 0.18 || l < 0.08 || l > 0.94) continue
    colorful++
    const bucket = buckets[Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS]!
    // Sytější barvy ve středních jasech váží víc.
    const weight = s * (1 - Math.abs(l - 0.5) * 1.4)
    bucket.weight += weight
    // Odstín se průměruje jako vektor (kvůli přechodu 359° → 0°).
    bucket.x += Math.cos((h * Math.PI) / 180) * weight
    bucket.y += Math.sin((h * Math.PI) / 180) * weight
    bucket.s += s
    bucket.n++
  }
  if (pixels === 0 || colorful / pixels < 0.03) return null

  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a))
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360
  const saturation = clamp(best.s / best.n, 0.35, 0.9)
  return {
    c1: hsl(hue, clamp(saturation * 0.85, 0.3, 0.75), 0.28),
    c2: hsl((hue + 25) % 360, clamp(saturation * 0.6, 0.25, 0.6), 0.09),
    accent: hsl(hue, clamp(saturation + 0.1, 0.55, 0.95), 0.64)
  }
}
