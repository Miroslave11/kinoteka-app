import { describe, expect, it } from 'vitest'
import { paletteFromPixels } from './posterPalette'

/** Obrázek z ploch dané barvy: [[r, g, b], počet pixelů]. */
function image(...areas: [[number, number, number], number][]): Uint8Array {
  const data: number[] = []
  for (const [[r, g, b], count] of areas) for (let i = 0; i < count; i++) data.push(r, g, b)
  return new Uint8Array(data)
}

const hue = (color: string): number => Number(/hsl\((\d+)/.exec(color)![1])
const lightness = (color: string): number => Number(/(\d+)%\)$/.exec(color)![1])

describe('paletteFromPixels', () => {
  it('červený plakát → červený akcent, tmavá pozadí', () => {
    const palette = paletteFromPixels(image([[200, 30, 30], 400], [[10, 10, 10], 600]))!
    expect(hue(palette.accent)).toBeLessThan(15)
    expect(lightness(palette.accent)).toBe(64)
    expect(lightness(palette.c1)).toBe(28)
    expect(lightness(palette.c2)).toBe(9)
  })

  it('převládá sytější barva, ne ta šedivější', () => {
    const palette = paletteFromPixels(
      image([[40, 120, 220], 300], [[120, 130, 110], 500], [[0, 0, 0], 200])
    )!
    const h = hue(palette.accent)
    expect(h).toBeGreaterThan(200)
    expect(h).toBeLessThan(225)
  })

  it('odstín kolem 0°/360° zprůměruje správně (nevznikne zelená)', () => {
    const palette = paletteFromPixels(image([[220, 20, 60], 300], [[220, 60, 20], 300]))!
    const h = hue(palette.accent)
    expect(h < 20 || h > 340).toBe(true)
  })

  it('černobílý nebo prázdný plakát → null (náhradní paleta)', () => {
    expect(paletteFromPixels(image([[30, 30, 30], 500], [[240, 240, 240], 500]))).toBeNull()
    expect(paletteFromPixels(new Uint8Array())).toBeNull()
  })
})
