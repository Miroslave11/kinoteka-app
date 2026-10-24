import { useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import {
  DEFAULT_FILTERS,
  filterOptions,
  filterTitles,
  type SortKey,
  type TitleFilters,
  type WatchedFilter
} from '../app/catalogData'
import { useAmbientPalette } from '../app/palette'
import Poster from '../components/Poster'
import { countOf } from '../../../shared/plural'

const SORTS: [SortKey, string][] = [
  ['added', 'Naposledy přidané'],
  ['name', 'Název'],
  ['year', 'Rok'],
  ['rating', 'Hodnocení IMDb'],
  ['my-rating', 'Moje hodnocení']
]

const WATCHED: [WatchedFilter, string][] = [
  ['unwatched', 'Nezhlédnuté'],
  ['watched', 'Zhlédnuté']
]

/** Mřížka filmů nebo seriálů s filtry a řazením. */
export default function BrowsePage({ kind }: { kind: 'movie' | 'show' }): React.JSX.Element {
  const { titles, loading } = useApp()
  const [filters, setFilters] = useState<TitleFilters>(DEFAULT_FILTERS)
  useAmbientPalette(null)

  const ofKind = useMemo(() => titles.filter((t) => t.kind === kind), [titles, kind])
  const options = useMemo(() => filterOptions(ofKind), [ofKind])
  const visible = useMemo(() => filterTitles(ofKind, filters), [ofKind, filters])
  const update = (patch: Partial<TitleFilters>): void => setFilters((f) => ({ ...f, ...patch }))
  const chip = (active: boolean): string => `chip ${active ? 'on' : ''}`
  const filtered =
    filters.resolution !== null ||
    filters.tag !== null ||
    filters.genre !== null ||
    filters.decade !== null ||
    filters.watched !== 'all'

  return (
    <div className="page">
      <h1>{kind === 'movie' ? 'Filmy' : 'Seriály'}</h1>
      <p className="subtitle">
        {visible.length === ofKind.length
          ? kind === 'movie'
            ? countOf(ofKind.length, 'film', 'filmy', 'filmů')
            : countOf(ofKind.length, 'seriál', 'seriály', 'seriálů')
          : `${visible.length} z ${ofKind.length}`}
      </p>

      <div className="toolbar">
        <button
          className={chip(!filters.resolution && !filters.tag)}
          onClick={() => update({ resolution: null, tag: null })}
        >
          Vše
        </button>
        {options.resolutions.length > 1 && <span className="divider" />}
        {options.resolutions.length > 1 &&
          options.resolutions.map((resolution) => (
            <button
              key={resolution}
              className={chip(filters.resolution === resolution)}
              onClick={() =>
                update({ resolution: filters.resolution === resolution ? null : resolution })
              }
            >
              {resolution}
            </button>
          ))}
        {options.tags.length > 0 && <span className="divider" />}
        {options.tags.map((tag) => (
          <button
            key={tag}
            className={chip(filters.tag === tag)}
            onClick={() => update({ tag: filters.tag === tag ? null : tag })}
          >
            {tag}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn sm" onClick={() => setFilters(DEFAULT_FILTERS)} hidden={!filtered}>
          Zrušit filtry
        </button>
      </div>

      <div className="toolbar">
        {WATCHED.map(([id, label]) => (
          <button
            key={id}
            className={chip(filters.watched === id)}
            onClick={() => update({ watched: filters.watched === id ? 'all' : id })}
          >
            {label}
          </button>
        ))}
        {options.genres.length > 0 && (
          <label className="chip select">
            Žánr:
            <select
              value={filters.genre ?? ''}
              onChange={(e) => update({ genre: e.target.value || null })}
            >
              <option value="">všechny</option>
              {options.genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </label>
        )}
        {options.decades.length > 1 && (
          <label className="chip select">
            Rok:
            <select
              value={filters.decade ?? ''}
              onChange={(e) => update({ decade: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">všechny</option>
              {options.decades.map((decade) => (
                <option key={decade} value={decade}>
                  {decade}–{decade + 9}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        <label className="chip select">
          Řadit:
          <select
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as SortKey })}
          >
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!loading && ofKind.length === 0 && (
        <p className="empty">Zatím nic. Přidej složku v Nastavení → Knihovna.</p>
      )}
      <div className="grid">
        {visible.map((title) => (
          <Poster key={title.id} title={title} />
        ))}
      </div>
    </div>
  )
}
