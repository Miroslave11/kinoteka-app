import { useState, type FormEvent } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { ClassificationResult, FileClassification } from '../../../shared/classification'
import { countOf } from '../../../shared/plural'

const toNumber = (value: string): number | null => {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? number : null
}

/**
 * Ruční zařazení souboru: film (název, rok), nebo díl seriálu (seriál, série, díl, název dílu).
 * Stejný název seriálu připojí díl k existujícímu seriálu.
 */
export default function ClassifyForm({
  fileId,
  current,
  manual,
  folderFileCount,
  showNames,
  onCancel,
  onSaved
}: {
  fileId: number
  current: FileClassification
  manual: boolean
  /** Video soubory ve stejné složce – nabídne zařazení celé složky (kurz). */
  folderFileCount: number
  /** Seriály v knihovně – nabídka u pole „Seriál“. */
  showNames: string[]
  onCancel: () => void
  onSaved: (result: ClassificationResult | null) => void
}): React.JSX.Element {
  const [kind, setKind] = useState(current.kind)
  const [title, setTitle] = useState(current.title)
  const [year, setYear] = useState(current.year ? String(current.year) : '')
  const [season, setSeason] = useState(current.kind === 'episode' ? String(current.season) : '1')
  const [episode, setEpisode] = useState(current.kind === 'episode' ? String(current.episode) : '1')
  const [episodeTitle, setEpisodeTitle] = useState(
    current.kind === 'episode' ? (current.episodeTitle ?? '') : ''
  )
  const [wholeFolder, setWholeFolder] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const folder = kind === 'episode' && wholeFolder

  const save = async (classification: FileClassification | null): Promise<void> => {
    setBusy(true)
    setError(null)
    const { catalog } = window.kinoteka
    const result =
      folder && classification
        ? await catalog.classifyFolder(fileId, classification)
        : await catalog.classify(fileId, classification)
    setBusy(false)
    if (classification && !result) setError('Zařazení se nepodařilo uložit, zkontroluj údaje.')
    else onSaved(result)
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const yearNumber = year.trim() ? toNumber(year) : null
    if (year.trim() && (yearNumber === null || yearNumber < 1880 || yearNumber > 2100)) {
      return setError('Rok zadej jako čtyřmístné číslo, nebo ho nech prázdný.')
    }
    if (kind === 'movie') {
      void save({ kind: 'movie', title: title.trim(), year: yearNumber })
      return
    }
    const seasonNumber = toNumber(season)
    // U celé složky se díly očíslují podle pořadí souborů.
    const episodeNumber = folder ? 1 : toNumber(episode)
    if (seasonNumber === null || episodeNumber === null || seasonNumber < 0 || episodeNumber < 0) {
      return setError('Sérii a díl zadej jako čísla.')
    }
    void save({
      kind: 'episode',
      title: title.trim(),
      year: yearNumber,
      season: seasonNumber,
      episode: episodeNumber,
      episodeTitle: episodeTitle.trim() || null
    })
  }

  return (
    <form className="classify" onSubmit={submit}>
      <h4>Upravit zařazení</h4>
      <div className="seg">
        <button
          type="button"
          className={`chip ${kind === 'movie' ? 'on' : ''}`}
          onClick={() => setKind('movie')}
        >
          Film
        </button>
        <button
          type="button"
          className={`chip ${kind === 'episode' ? 'on' : ''}`}
          onClick={() => {
            // Rok filmu k seriálu nepatří – u dílu by přepsal rok seriálu.
            if (kind === 'movie') setYear('')
            setKind('episode')
          }}
        >
          Díl seriálu
        </button>
      </div>

      <div className="form-grid">
        <label htmlFor="classify-title">{kind === 'movie' ? 'Název filmu' : 'Seriál'}</label>
        <input
          id="classify-title"
          className="field"
          value={title}
          required
          list={kind === 'episode' ? 'classify-shows' : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label htmlFor="classify-year">Rok</label>
        <input
          id="classify-year"
          className="field narrow"
          inputMode="numeric"
          placeholder="nepovinný"
          value={year}
          onChange={(event) => setYear(event.target.value)}
        />
        {kind === 'episode' && (
          <>
            <label htmlFor="classify-season">{folder ? 'Série' : 'Série a díl'}</label>
            <span className="pair">
              <input
                id="classify-season"
                className="field narrow"
                inputMode="numeric"
                aria-label="Série"
                value={season}
                onChange={(event) => setSeason(event.target.value)}
              />
              {!folder && (
                <input
                  className="field narrow"
                  inputMode="numeric"
                  aria-label="Díl"
                  value={episode}
                  onChange={(event) => setEpisode(event.target.value)}
                />
              )}
            </span>
            {!folder && (
              <>
                <label htmlFor="classify-episode-title">Název dílu</label>
                <input
                  id="classify-episode-title"
                  className="field"
                  placeholder="nepovinný"
                  value={episodeTitle}
                  onChange={(event) => setEpisodeTitle(event.target.value)}
                />
              </>
            )}
          </>
        )}
      </div>
      {kind === 'episode' && folderFileCount > 1 && (
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={wholeFolder}
            onChange={() => setWholeFolder(!wholeFolder)}
          />
          Zařadit stejně celou složku ({countOf(folderFileCount, 'soubor', 'soubory', 'souborů')}) –
          třeba kurz. Díly se očíslují podle pořadí názvů souborů.
        </label>
      )}
      <datalist id="classify-shows">
        {showNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p className="muted small">
        {kind === 'episode'
          ? 'Napiš nebo vyber název existujícího seriálu – díl se k němu připojí. Nový název vytvoří nový seriál.'
          : 'Údaje z TMDB se pro film dohledají znovu podle nového názvu a roku.'}{' '}
        Ruční zařazení vydrží i další skeny.
      </p>
      {error && <p className="notice is-error">{error}</p>}

      <div className="dialog-foot">
        {manual && (
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            onClick={() => void save(null)}
            title="Zapomenout ruční zařazení a rozpoznat soubor znovu podle názvu"
          >
            <RotateCcw size={15} /> Vrátit automatické rozpoznání
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onCancel} disabled={busy}>
          Zrušit
        </button>
        <button type="submit" className="btn sm primary" disabled={busy || !title.trim()}>
          <Check size={15} /> Uložit
        </button>
      </div>
    </form>
  )
}
