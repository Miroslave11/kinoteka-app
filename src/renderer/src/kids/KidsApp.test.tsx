// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KinotekaApi } from '../../../shared/api'
import type { KidsTitle, KidsVideo } from '../../../shared/kids'
import KidsApp from './KidsApp'

const video = (id: number, titleId: number | null, name: string, addedAt: string): KidsVideo => ({
  id,
  titleId,
  name,
  originalName: name,
  channel: null,
  durationSec: 300,
  thumbnailUrl: null,
  addedAt
})

const TITLES: KidsTitle[] = [
  {
    id: 1,
    name: 'Prasátko Peppa',
    keywords: [],
    coverUrl: null,
    videos: [
      video(2, 1, 'Bláto', '2026-10-24T10:00:00Z'),
      video(1, 1, 'Výlet', '2026-10-20T10:00:00Z')
    ]
  },
  {
    id: 2,
    name: 'Krteček',
    keywords: [],
    coverUrl: null,
    videos: [video(3, 2, 'Krtek a autíčko', '2026-10-22T10:00:00Z')]
  }
]

let api: { kids: Record<string, ReturnType<typeof vi.fn>> }

beforeEach(() => {
  api = {
    kids: {
      listTitles: vi.fn(async () => TITLES),
      getSettings: vi.fn(async () => ({ theme: 'jednorozci' })),
      scan: vi.fn(async () => ({ titles: 2, videos: 3, sorted: 0, errors: [] })),
      onChanged: vi.fn(() => () => undefined),
      playVideo: vi.fn(async () => ({ ok: true }))
    }
  }
  window.kinoteka = api as unknown as KinotekaApi
})

afterEach(cleanup)

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/deti/*" element={<KidsApp />} />
      </Routes>
    </MemoryRouter>
  )

describe('KidsApp', () => {
  it('Domů: tituly, nejnovější pohádky první a motiv z nastavení', async () => {
    const { container } = renderAt('/deti')
    await screen.findAllByText('Prasátko Peppa')
    const bubbles = [...container.querySelectorAll('.k-bubble b')].map((b) => b.textContent)
    expect(bubbles).toEqual(['Prasátko Peppa', 'Krteček'])
    const cards = [...container.querySelectorAll('.k-card b')].map((b) => b.textContent)
    expect(cards).toEqual(['Bláto', 'Krtek a autíčko', 'Výlet'])
    expect(container.querySelector('.k-app')?.getAttribute('data-theme')).toBe('jednorozci')
    // Při otevření se složka prohledá (nová videa).
    expect(api.kids.scan).toHaveBeenCalled()
  })

  it('klik na titul otevře detail, klik na pohádku ji přehraje', async () => {
    const { container } = renderAt('/deti')
    await screen.findAllByText('Krteček')
    fireEvent.click(container.querySelectorAll('.k-bubble')[1]!)
    expect(await screen.findByText('1 pohádka')).toBeTruthy()
    fireEvent.click(screen.getByText('Krtek a autíčko'))
    expect(api.kids.playVideo).toHaveBeenCalledWith(3)
  })

  it('prázdná složka – vysvětlení pro rodiče', async () => {
    api.kids.listTitles!.mockResolvedValue([])
    renderAt('/deti')
    expect(await screen.findByText(/Zatím tu nejsou žádné pohádky/)).toBeTruthy()
  })
})
