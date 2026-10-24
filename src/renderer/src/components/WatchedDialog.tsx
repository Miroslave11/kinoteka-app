import { useEffect, useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { episodeCode } from '../../../shared/playback'
import { normalizeSearch } from '../../../shared/search'
import { useApp } from '../app/AppContext'
import {
  displayName,
  episodeLabel,
  journalState,
  watchedTitle,
  type TitleItem
} from '../app/catalogData'

/** Teď jako hodnota pro `<input type="datetime-local">` (místní čas). */
function nowLocal(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

export interface WatchedTarget {
  titleId: number
  /** Díly; prázdné = film nebo celý seriál. */
  episodeIds: number[]
  label: string
}

/**
 * „Viděl jsem“ – ruční záznam do deníku s datem a poznámkou. Buď pro daný film, díl
 * nebo sérii (`target`), nebo s výběrem titulu z knihovny (z obrazovky Deník).
 */
export default function WatchedDialog({
  target,
  onClose
}: {
  target?: WatchedTarget
  onClose: () => void
}): React.JSX.Element {
  const { titles } = useApp()
  const [watchedAt, setWatchedAt] = useState(nowLocal)
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<TitleItem | null>(null)
  const [episodes, setEpisodes] = useState<number[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const matches = useMemo(() => {
    const q = normalizeSearch(query)
    return titles
      .filter(
        (t) =>
          !q || normalizeSearch(displayName(t)).includes(q) || normalizeSearch(t.name).includes(q)
      )
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'cs'))
      .slice(0, 8)
  }, [titles, query])

  const chosen: WatchedTarget | null =
    target ??
    (picked ? { titleId: picked.id, episodeIds: episodes, label: displayName(picked) } : null)

  // Už zapsané se omylem nepřidá znovu; další zhlédnutí jde zapsat jen výslovně.
  const chosenTitle = chosen && titles.find((t) => t.id === chosen.titleId)
  const already = chosen && chosenTitle ? journalState(chosenTitle, chosen.episodeIds) : null
  const what =
    chosenTitle?.kind === 'movie'
      ? 'Tento film už v deníku je'
      : chosen?.episodeIds.length === 1
        ? 'Tento díl už v deníku je'
        : 'Tyto díly už v deníku jsou'

  const save = async (): Promise<void> => {
    if (!chosen || !watchedAt) return
    setBusy(true)
    await window.kinoteka.journal.addManual({
      titleId: chosen.titleId,
      episodeIds: chosen.episodeIds,
      watchedAt: new Date(watchedAt).toISOString(),
      note: note.trim() || null
    })
    onClose()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog watched-dialog"
        role="dialog"
        aria-label="Viděl jsem"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h3>Viděl jsem{target ? `: ${target.label}` : ''}</h3>
          <button className="icon-btn sm" onClick={onClose} title="Zavřít (Esc)">
            <X size={18} />
          </button>
        </header>

        {!target && (
          <div className="watched-pick">
            <input
              className="field"
              placeholder="Najít film nebo seriál…"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="pick-list">
              {matches.map((title) => (
                <button
                  key={`${title.kind}-${title.id}`}
                  className={`pick ${picked === title ? 'on' : ''}`}
                  onClick={() => {
                    setPicked(title)
                    setEpisodes([])
                  }}
                >
                  {picked === title && <Check size={15} />}
                  {displayName(title)}
                  <small>{title.kind === 'show' ? 'seriál' : (title.year ?? '')}</small>
                </button>
              ))}
              {matches.length === 0 && <p className="muted small">Nic nenalezeno.</p>}
            </div>
            {picked?.kind === 'show' && (
              <div className="pick-episodes">
                <p className="muted small">
                  Které díly? Když žádný nevybereš, zapíše se celý seriál.
                </p>
                {picked.seasons
                  .flatMap((s) => s.episodes)
                  .map((episode) => (
                    <label key={episode.id} className="toggle-row">
                      <input
                        type="checkbox"
                        checked={episodes.includes(episode.id)}
                        onChange={() =>
                          setEpisodes((list) =>
                            list.includes(episode.id)
                              ? list.filter((id) => id !== episode.id)
                              : [...list, episode.id]
                          )
                        }
                      />
                      <span>
                        {episodeLabel(picked, episode) ||
                          episodeCode(episode.season, episode.episode)}
                      </span>
                    </label>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="form-grid">
          <label htmlFor="watched-at">Kdy</label>
          <input
            id="watched-at"
            className="field"
            type="datetime-local"
            value={watchedAt}
            max={nowLocal()}
            onChange={(event) => setWatchedAt(event.target.value)}
          />
          <label htmlFor="watched-note">Poznámka</label>
          <textarea
            id="watched-note"
            className="field"
            rows={3}
            placeholder="Nepovinné – třeba s kým, kde, jak se líbilo"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {already && (
          <p className="info-chip watched-already">
            {what} ({watchedTitle(already).toLowerCase()}). Pokud jsi to viděl znovu, zapiš další
            zhlédnutí.
          </p>
        )}

        <div className="dialog-foot">
          {already ? (
            <>
              <button className="btn sm" disabled={busy} onClick={() => void save()}>
                Zapsat další zhlédnutí
              </button>
              <button className="btn sm primary" onClick={onClose}>
                Zavřít
              </button>
            </>
          ) : (
            <>
              <button className="btn sm" onClick={onClose}>
                Zrušit
              </button>
              <button
                className="btn sm primary"
                disabled={!chosen || busy}
                onClick={() => void save()}
              >
                <Check size={16} /> Zapsat do deníku
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
