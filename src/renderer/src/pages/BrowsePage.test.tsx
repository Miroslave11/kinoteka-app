// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KinotekaApi } from '../../../shared/api'
import type { CatalogFile, MovieItem } from '../../../shared/catalog'
import { AppProvider } from '../app/AppContext'
import BrowsePage from './BrowsePage'

const file = (id: number, tags: string[]): CatalogFile => ({
  id,
  fileName: `${id}.mkv`,
  relativePath: `${id}.mkv`,
  size: 1,
  available: true,
  tags,
  addedAt: `2026-10-0${id}T00:00:00Z`,
  summary: null
})

const MOVIES: MovieItem[] = [
  {
    id: 1,
    name: 'Prázdnota',
    year: 2020,
    tags: ['CZ dabing'],
    files: [file(1, ['CZ dabing'])],
    metadata: null,
    matchStatus: 'pending'
  },
  {
    id: 2,
    name: 'Predátor - Nebezpečné Území',
    year: 2025,
    tags: ['CZ titulky'],
    files: [file(2, ['CZ titulky'])],
    metadata: null,
    matchStatus: 'pending'
  }
]

beforeEach(() => {
  const api = {
    catalog: {
      listMovies: vi.fn(async () => MOVIES),
      listShows: vi.fn(async () => []),
      getFileDetails: vi.fn()
    },
    library: { listFolders: vi.fn(async () => []), onChanged: () => () => undefined },
    player: { onClosed: () => () => undefined, playFile: vi.fn() }
  } as unknown as KinotekaApi
  window.kinoteka = api
})

afterEach(cleanup)

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/filmy']}>
      <AppProvider>
        <Routes>
          <Route path="/filmy" element={<BrowsePage kind="movie" />} />
          <Route path="/filmy/:id" element={<p>detail filmu</p>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>
  )
}

describe('BrowsePage', () => {
  it('zobrazí filmy z knihovny a filtruje podle štítku', async () => {
    renderPage()
    expect(await screen.findByText('2 filmů')).toBeTruthy()
    expect(screen.getAllByText('Prázdnota').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'CZ titulky' }))
    expect(screen.getByText('1 z 2')).toBeTruthy()
    expect(screen.queryAllByText('Prázdnota')).toHaveLength(0)
  })

  it('klik na plakát otevře detail', async () => {
    renderPage()
    const poster = (await screen.findAllByText('Prázdnota'))[0]!.closest('button')!
    fireEvent.click(poster)
    expect(await screen.findByText('detail filmu')).toBeTruthy()
  })
})
