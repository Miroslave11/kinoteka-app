import { describe, expect, it } from 'vitest'
import { groupMediaFiles } from './grouping'

const files = (...paths: string[]) => paths.map((relativePath, i) => ({ id: i + 1, relativePath }))

describe('groupMediaFiles – složka uživatele', () => {
  const grouping = groupMediaFiles(
    files(
      'Den odhalení (2026) CZ DABING.mkv', // 1
      'Predátor - Nebezpečné Území 2025 HD (cz titl).mkv', // 2
      'Prázdnota (2020) cz dabing.mkv', // 3
      'V úkrytu (2026) cz dabing.mkv', // 4
      'Vidim vas - The.Watcher.S01E03.WEBRip.CZ.5.1.mp4', // 5
      'Vidím Vás (2022) S01E01 HD CZ Dabing!!!.mkv', // 6
      'Země gangů S01E01 CZ Dab 2025.mkv', // 7
      'Země gangů S01E03.mkv', // 8
      'Země gangů_S01E02_Puzzle.mp4', // 9
      'Úkryt nebo past (2026) cz dabing.mkv' // 10
    )
  )

  it('najde 5 filmů', () => {
    expect(grouping.movies.map((m) => `${m.name} (${m.year})`).sort()).toEqual([
      'Den odhalení (2026)',
      'Predátor - Nebezpečné Území (2025)',
      'Prázdnota (2020)',
      'V úkrytu (2026)',
      'Úkryt nebo past (2026)'
    ])
  })

  it('najde 2 seriály', () => {
    expect(grouping.shows.map((s) => s.name).sort()).toEqual(['Vidím Vás', 'Země gangů'])
  })

  it('sloučí „Vidím Vás“ a „Vidim vas - The Watcher“ do jednoho seriálu', () => {
    const show = grouping.shows.find((s) => s.name === 'Vidím Vás')!
    expect(show).toMatchObject({ year: 2022, alternativeNames: ['The Watcher'] })
    expect(show.keys).toEqual(['the watcher', 'vidim vas'])
    expect(show.episodes.map((e) => [e.season, e.episode, e.fileIds])).toEqual([
      [1, 1, [6]],
      [1, 3, [5]]
    ])
  })

  it('Země gangů má 3 díly v pořadí, díl 2 s názvem', () => {
    const show = grouping.shows.find((s) => s.name === 'Země gangů')!
    expect(show.year).toBe(2025)
    expect(show.episodes.map((e) => [e.episode, e.name, e.fileIds])).toEqual([
      [1, null, [7]],
      [2, 'Puzzle', [9]],
      [3, null, [8]]
    ])
  })
})

describe('groupMediaFiles – další případy', () => {
  it('dva soubory stejného filmu = jeden film', () => {
    const { movies } = groupMediaFiles(files('Pelíšky (1999) 1080p.mkv', 'Pelisky (1999) 720p.avi'))
    expect(movies).toHaveLength(1)
    expect(movies[0]).toMatchObject({ name: 'Pelíšky', year: 1999, fileIds: [1, 2] })
  })

  it('stejný název, jiný rok = různé filmy (remake)', () => {
    const { movies } = groupMediaFiles(files('Dune (1984).mkv', 'Dune (2021).mkv'))
    expect(movies).toHaveLength(2)
  })

  it('díly ve složkách seriálu se spojí s díly pojmenovanými v souboru', () => {
    const { shows } = groupMediaFiles(
      files('Seriály\\Dark\\Série 1\\01.mkv', 'Seriály\\Dark\\Série 1\\02.mkv', 'Dark.S02E01.mkv')
    )
    expect(shows).toHaveLength(1)
    expect(shows[0]!.episodes.map((e) => `${e.season}x${e.episode}`)).toEqual(['1x1', '1x2', '2x1'])
  })

  it('dva soubory téhož dílu patří k jednomu dílu', () => {
    const { shows } = groupMediaFiles(files('Dark S01E01 720p.mkv', 'Dark S01E01 2160p.mkv'))
    expect(shows[0]!.episodes).toEqual([{ season: 1, episode: 1, name: null, fileIds: [1, 2] }])
  })

  it('díl bez názvu seriálu skončí v „Neznámý seriál“', () => {
    const { shows } = groupMediaFiles(files('S01E01.mkv'))
    expect(shows[0]!.name).toBe('Neznámý seriál')
  })
})
