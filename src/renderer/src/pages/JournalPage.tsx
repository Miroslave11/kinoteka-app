import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import {
  entryLabel,
  filterJournal,
  groupByMonth,
  journalStats,
  type JournalEntry,
  type JournalKind,
  type JournalRatingFilter
} from '../../../shared/journal'
import { useAmbientPalette, placeholderStyle } from '../app/palette'
import Artwork from '../components/Artwork'
import Stars from '../components/Stars'
import WatchedDialog from '../components/WatchedDialog'
import { plural } from '../../../shared/plural'

const KINDS: [JournalKind, string][] = [
  ['all', 'Vše'],
  ['movie', 'Filmy'],
  ['show', 'Seriály']
]
const RATINGS: [JournalRatingFilter, string][] = [
  [5, '★★★★★'],
  [4, '★★★★'],
  [3, '★★★'],
  ['none', 'Bez hodnocení']
]

/** ISO → hodnota pro `<input type="datetime-local">`. */
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

/** Deník zhlédnutých: statistiky, filtry, záznamy po měsících, hodnocení a poznámky. */
export default function JournalPage(): React.JSX.Element {
  const { journal, library } = window.kinoteka
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [kind, setKind] = useState<JournalKind>('all')
  const [rating, setRating] = useState<JournalRatingFilter>('all')
  const [adding, setAdding] = useState(false)
  useAmbientPalette(null)

  const reload = useCallback(() => void journal.list().then(setEntries), [journal])
  useEffect(() => {
    reload()
    return library.onChanged(reload)
  }, [library, reload])

  const stats = useMemo(() => journalStats(entries ?? []), [entries])
  const groups = useMemo(
    () => groupByMonth(filterJournal(entries ?? [], kind, rating)),
    [entries, kind, rating]
  )

  return (
    <div className="page journal">
      <h1>Deník zhlédnutých</h1>
      <p className="subtitle">
        Co a kdy jsi viděl, s tvým hodnocením. Záznamy zůstávají i po smazání souboru.
      </p>

      <div className="stats">
        <div className="stat">
          <b>{stats.moviesThisYear}</b>
          <span>
            {plural(stats.moviesThisYear, 'film zhlédnutý', 'filmy zhlédnuté', 'filmů zhlédnuto')}{' '}
            letos
          </span>
        </div>
        <div className="stat">
          <b>{stats.episodesThisYear}</b>
          <span>
            {plural(stats.episodesThisYear, 'díl seriálu', 'díly seriálů', 'dílů seriálů')} letos
          </span>
        </div>
        <div className="stat">
          <b>
            {stats.averageRating === null
              ? '–'
              : `★ ${stats.averageRating.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}`}
          </b>
          <span>průměrné moje hodnocení</span>
        </div>
        <div className="stat">
          <b>{stats.totalHours} h</b>
          <span>celkový čas u filmů a seriálů</span>
        </div>
      </div>

      <div className="toolbar">
        {KINDS.map(([id, label]) => (
          <button
            key={id}
            className={`chip ${kind === id ? 'on' : ''}`}
            onClick={() => setKind(id)}
          >
            {label}
          </button>
        ))}
        <span className="divider" />
        {RATINGS.map(([id, label]) => (
          <button
            key={String(id)}
            className={`chip ${rating === id ? 'on' : ''}`}
            onClick={() => setRating(rating === id ? 'all' : id)}
          >
            {label}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn sm" onClick={() => setAdding(true)}>
          <Plus size={16} /> Přidat „Viděl jsem“
        </button>
      </div>

      {entries === null && <p className="empty">Načítám…</p>}
      {entries?.length === 0 && (
        <p className="empty">
          Deník je zatím prázdný. Film se zapíše sám, když ho dokoukáš (přes 90 %), nebo ho přidej
          ručně tlačítkem „Viděl jsem“.
        </p>
      )}
      {entries && entries.length > 0 && groups.length === 0 && (
        <p className="empty">Filtru nic neodpovídá.</p>
      )}

      {groups.map((group) => (
        <section key={group.month}>
          <h3 className="month">{group.month}</h3>
          {group.entries.map((entry) => (
            <JournalRow key={entry.id} entry={entry} />
          ))}
        </section>
      ))}

      {adding && <WatchedDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

function JournalRow({ entry }: { entry: JournalEntry }): React.JSX.Element {
  const { journal } = window.kinoteka
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [when, setWhen] = useState(toLocalInput(entry.watchedAt))
  const [note, setNote] = useState(entry.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const open = (): void => {
    if (entry.inLibrary)
      navigate(entry.kind === 'movie' ? `/filmy/${entry.titleId}` : `/serialy/${entry.titleId}`)
  }
  const save = async (): Promise<void> => {
    await journal.update(entry.id, { watchedAt: new Date(when).toISOString(), note })
    setEditing(false)
  }

  return (
    <div className="h-row">
      <button
        className={`poster h-poster ${entry.posterUrl ? 'has-art' : ''}`}
        style={placeholderStyle(entry.titleName)}
        onClick={open}
        disabled={!entry.inLibrary}
        title={entry.inLibrary ? 'Otevřít detail' : 'Soubor už v knihovně není'}
      >
        <Artwork src={entry.posterUrl} alt={entry.titleName} />
      </button>

      <div className="h-main">
        <button className="h-title" onClick={open} disabled={!entry.inLibrary}>
          {entryLabel(entry)}
        </button>
        {editing ? (
          <textarea
            className="field"
            rows={2}
            value={note}
            placeholder="Poznámka"
            onChange={(event) => setNote(event.target.value)}
          />
        ) : (
          entry.note && <div className="note">„{entry.note}“</div>
        )}
      </div>

      <div className="when">
        {editing ? (
          <input
            className="field"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        ) : (
          <>
            {formatWhen(entry.watchedAt)}
            <span>
              {[
                entry.ordinal > 1 && `viděno ${entry.ordinal}×`,
                entry.source === 'manual' && 'zapsáno ručně',
                !entry.inLibrary && 'mimo knihovnu'
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        )}
      </div>

      <Stars
        value={entry.rating}
        size={16}
        onChange={(value) => void journal.setRating(entry.titleId, value)}
      />

      <div className="h-actions">
        {editing ? (
          <>
            <button className="icon-btn xs" title="Uložit" onClick={() => void save()}>
              <Check size={15} />
            </button>
            <button className="icon-btn xs" title="Zrušit" onClick={() => setEditing(false)}>
              <X size={15} />
            </button>
          </>
        ) : confirmDelete ? (
          <>
            <button
              className="btn sm danger"
              onClick={() => void journal.remove(entry.id)}
              title="Odebrat záznam z deníku (soubor zůstane)"
            >
              Odebrat
            </button>
            <button className="icon-btn xs" title="Zpět" onClick={() => setConfirmDelete(false)}>
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <button
              className="icon-btn xs"
              title="Upravit datum a poznámku"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />
            </button>
            <button
              className="icon-btn xs"
              title="Odebrat záznam"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
