import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, ImagePlus, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import {
  MAX_KEYWORDS,
  type KidsManageAction,
  type KidsManageResult,
  type KidsTitle,
  type KidsTmdbChoice,
  type KidsTmdbResult,
  type KidsTmdbStatus,
  type KidsVideo
} from '../../../shared/kids'
import { countOf } from '../../../shared/plural'
import { imageStyle, minutes } from './KidsParts'

/** Úprava z části Pro rodiče: akce správy titulů, nebo jiné volání s výsledkem (null = zrušeno). */
type Run = (action: KidsManageAction | (() => Promise<KidsManageResult | null>)) => Promise<void>

const TMDB_STATUS_TEXT: Record<KidsTmdbStatus, string> = {
  pending: 'Hledám pořad na TMDB… (potřebuje klíč TMDB v Nastavení → Metadata)',
  matched: 'Obrázky jsou z pořadu',
  manual: 'Obrázky jsou z pořadu (vybráno ručně)',
  none: 'Na TMDB se pořad nenašel – najdi ho ručně.',
  off: 'Obrázky z TMDB jsou u titulu vypnuté.'
}

/** Pořad na TMDB, ze kterého jsou obrázky titulu – a ruční hledání jiného. */
function TmdbMatch({
  title,
  run
}: {
  title: KidsTitle & { id: number }
  run: Run
}): React.JSX.Element {
  const { kids } = window.kinoteka
  const [query, setQuery] = useState<string | null>(null)
  const [results, setResults] = useState<KidsTmdbResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { tmdb } = title

  const search = async (): Promise<void> => {
    if (!query?.trim()) return
    setSearching(true)
    setMessage(null)
    const result = await kids.searchTmdb(query)
    setSearching(false)
    if (!result.ok) return setMessage(result.message)
    setResults(result.results)
    if (result.results.length === 0) setMessage('Nic se nenašlo – zkus jiný název nebo odkaz.')
  }
  const choose = async (choice: KidsTmdbChoice): Promise<void> => {
    await run(() => kids.chooseTmdb(title.id, choice))
    setQuery(null)
    setResults(null)
  }

  return (
    <div className="k-tmdb">
      <p className="k-hint">
        {TMDB_STATUS_TEXT[tmdb.status]}
        {tmdb.name && (tmdb.status === 'matched' || tmdb.status === 'manual') && (
          <>
            {' '}
            <b>{tmdb.name}</b>
            {tmdb.year && ` (${tmdb.year})`}
          </>
        )}
      </p>
      {query === null ? (
        <div className="k-row">
          <button className="k-btn" onClick={() => setQuery(tmdb.name ?? title.name)}>
            <Search size={18} /> {tmdb.id ? 'Hledat jiný pořad' : 'Najít na TMDB'}
          </button>
          {tmdb.status !== 'off' && tmdb.status !== 'none' && (
            <button className="k-btn" onClick={() => void choose(null)}>
              Nepoužívat TMDB
            </button>
          )}
          {(tmdb.status === 'off' || tmdb.status === 'none') && (
            <button
              className="k-btn"
              onClick={() => void run({ kind: 'tmdb-retry', titleId: title.id })}
            >
              <RotateCcw size={18} /> Hledat znovu
            </button>
          )}
        </div>
      ) : (
        <div className="k-tmdb-search">
          <div className="k-row">
            <input
              className="k-field"
              autoFocus
              value={query}
              maxLength={300}
              placeholder="Název pořadu nebo odkaz z themoviedb.org"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search()
                if (e.key === 'Escape') setQuery(null)
              }}
            />
            <button
              className="k-btn grape"
              disabled={searching || !query.trim()}
              onClick={() => void search()}
            >
              {searching ? 'Hledám…' : 'Hledat'}
            </button>
            <button className="k-btn" onClick={() => setQuery(null)}>
              Zrušit
            </button>
          </div>
          <p className="k-hint">
            Zkus název česky i anglicky (třeba „Bing bunny“). Když se pořad nenajde, vyhledej ho na
            themoviedb.org a vlož sem odkaz na jeho stránku.
          </p>
          {message && <p className="k-hint">{message}</p>}
          {results && results.length > 0 && (
            <div className="k-tmdb-results">
              {results.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  onClick={() => void choose({ kind: r.kind, id: r.id })}
                >
                  <span className="k-tmdb-poster" style={imageStyle(r.posterUrl, r.name)} />
                  <span>
                    <b>{r.name}</b>
                    <small>
                      {[r.kind === 'tv' ? 'seriál' : 'film', r.year, r.originalName]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Mazací tlačítko na dvě kliknutí – první se zeptá, druhé smaže. */
function TrashButton({
  label,
  confirm,
  onConfirm
}: {
  label?: string
  confirm: string
  onConfirm: () => void
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const timer = setTimeout(() => setAsking(false), 4000)
    return () => clearTimeout(timer)
  }, [asking])
  return (
    <button
      className={`k-trash${asking ? ' asking' : ''}`}
      title={asking ? undefined : 'Smazat do Koše'}
      onClick={() => {
        if (!asking) return setAsking(true)
        setAsking(false)
        onConfirm()
      }}
    >
      <Trash2 size={18} />
      {asking ? confirm : label}
    </button>
  )
}

function VideoRow({
  video,
  title,
  titles,
  run
}: {
  video: KidsVideo
  title: KidsTitle
  titles: KidsTitle[]
  run: Run
}): React.JSX.Element {
  const targets = titles.filter((t) => t.id !== null && t.id !== title.id)
  return (
    <div className="k-vid">
      <span className="k-vid-thumb" style={imageStyle(video.thumbnailUrl, video.name)} />
      <span className="k-vid-name">
        {video.name}
        {video.channel && <small>{video.channel}</small>}
      </span>
      <small>{minutes(video.durationSec)}</small>
      <select
        className="k-field"
        value=""
        disabled={targets.length === 0}
        onChange={(e) =>
          void run({ kind: 'move-video', videoId: video.id, titleId: Number(e.target.value) })
        }
      >
        <option value="" disabled>
          Přesunout do…
        </option>
        {targets.map((t) => (
          <option key={t.id} value={t.id!}>
            {t.name}
          </option>
        ))}
      </select>
      <TrashButton
        confirm="Smazat?"
        onConfirm={() => void run({ kind: 'trash-video', videoId: video.id })}
      />
    </div>
  )
}

/** Název, obrázek a klíčová slova titulu (titul „Ostatní“ je nemá). */
function TitleForm({
  title,
  folder,
  run
}: {
  title: KidsTitle & { id: number }
  folder: string
  run: Run
}): React.JSX.Element {
  const [name, setName] = useState(title.name)
  const [keyword, setKeyword] = useState('')
  useEffect(() => setName(title.name), [title.name])

  const covers = title.videos
    .filter((v) => v.thumbnailUrl)
    .slice(0, title.artwork.length > 0 ? 6 : 11)
  const pickCover = (): Promise<void> => run(() => window.kinoteka.kids.pickCover(title.id))
  const setKeywords = (keywords: string[]): Promise<void> =>
    run({ kind: 'set-keywords', titleId: title.id, keywords })
  const addKeyword = (): void => {
    if (!keyword.trim()) return
    void setKeywords([...title.keywords, keyword])
    setKeyword('')
  }

  return (
    <div className="k-form k-title-form">
      <label>Název</label>
      <div className="k-row">
        <input
          className="k-field"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim() && name.trim() !== title.name)
              void run({ kind: 'rename-title', titleId: title.id, name })
          }}
        />
        <button
          className="k-btn grape"
          disabled={!name.trim() || name.trim() === title.name}
          onClick={() => void run({ kind: 'rename-title', titleId: title.id, name })}
        >
          Přejmenovat
        </button>
      </div>

      <label>Obrázek titulu</label>
      <div className="k-covers">
        {title.artwork.map((art, index) => (
          <button
            key={art.path}
            title="Obrázek pořadu z TMDB"
            className={
              title.coverImage === art.path ||
              (index === 0 && !title.coverImage && title.coverVideoId === null)
                ? 'on'
                : undefined
            }
            style={imageStyle(art.url, title.name)}
            onClick={() =>
              void run({ kind: 'set-cover-image', titleId: title.id, image: art.path })
            }
          />
        ))}
        {covers.map((video) => (
          <button
            key={video.id}
            title={video.name}
            className={
              title.coverVideoId === video.id ||
              (title.artwork.length === 0 &&
                !title.coverImage &&
                title.coverVideoId === null &&
                video.id === title.videos[0]?.id)
                ? 'on'
                : undefined
            }
            style={imageStyle(video.thumbnailUrl, video.name)}
            onClick={() =>
              void run({
                kind: 'set-cover',
                titleId: title.id,
                // Bez obrázků z TMDB je první video výchozí obrázek – není potřeba ho ukládat.
                videoId:
                  title.artwork.length === 0 && video.id === title.videos[0]?.id ? null : video.id
              })
            }
          />
        ))}
        {title.coverImage === 'file' && (
          <button
            title="Vlastní obrázek"
            className="on"
            style={imageStyle(title.coverUrl, title.name)}
          />
        )}
        <button
          className="k-cover-add"
          title="Vybrat vlastní obrázek ze souboru"
          onClick={() => void pickCover()}
        >
          <ImagePlus size={24} />
        </button>
      </div>

      <label>Pořad na TMDB</label>
      <TmdbMatch title={title} run={run} />

      <label>
        Zařazovat videa, kde je
        <small>v názvu, kanálu nebo playlistu</small>
      </label>
      <div className="k-chips">
        {title.keywords.map((k) => (
          <span key={k}>
            {k}
            <button
              title="Odebrat"
              onClick={() => void setKeywords(title.keywords.filter((other) => other !== k))}
            >
              <X size={14} />
            </button>
          </span>
        ))}
        {title.keywords.length < MAX_KEYWORDS && (
          <input
            className="k-chip-add"
            placeholder="+ přidat"
            value={keyword}
            maxLength={40}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addKeyword()
            }}
            onBlur={addKeyword}
          />
        )}
      </div>

      <label>Složka</label>
      <p className="k-hint k-path">{`${folder}\\${title.name}`}</p>
    </div>
  )
}

/** Část Pro rodiče → Tituly: přejmenování, obrázek, klíčová slova, přesun a mazání videí. */
export default function KidsParentTitles(): React.JSX.Element {
  const { kids } = window.kinoteka
  const [folder, setFolder] = useState('')
  const [titles, setTitles] = useState<KidsTitle[]>([])
  const [selected, setSelected] = useState<number | null | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const result = await kids.manageTitles()
    setFolder(result.folder)
    setTitles(result.titles)
  }, [kids])

  useEffect(() => {
    void load()
    return kids.onChanged(() => void load())
  }, [kids, load])

  const run: Run = async (action) => {
    setError(null)
    const result = typeof action === 'function' ? await action() : await kids.manage(action)
    if (result && !result.ok) setError(result.message)
    await load()
  }

  const create = async (): Promise<void> => {
    const name = creating?.trim()
    if (!name) return setCreating(null)
    setError(null)
    const result = await kids.manage({ kind: 'create-title', name })
    if (!result.ok) return setError(result.message)
    setCreating(null)
    await load()
    const created = (await kids.manageTitles()).titles.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    )
    if (created) setSelected(created.id)
  }

  // Smazaný (nebo ještě nevybraný) titul → první v seznamu.
  const title = titles.find((t) => t.id === selected) ?? titles[0]

  return (
    <div className="k-two k-titles">
      <div className="k-panel">
        <h3 className="k-panel-h">
          Tituly <small>{titles.filter((t) => t.id !== null).length}</small>
        </h3>
        <div className="k-tlist">
          {titles.map((t) => (
            <button
              key={t.id ?? 'ostatni'}
              className={`k-trow${t === title ? ' on' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              <span className="k-mini" style={imageStyle(t.coverUrl, t.name)} />
              {t.name}
              <small>{t.videos.length}</small>
            </button>
          ))}
        </div>
        {creating === null ? (
          <button className="k-btn k-new" onClick={() => setCreating('')}>
            <Plus size={18} /> Nový titul
          </button>
        ) : (
          <div className="k-row k-new">
            <input
              className="k-field"
              autoFocus
              placeholder="Název titulu"
              maxLength={120}
              value={creating}
              onChange={(e) => setCreating(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create()
                if (e.key === 'Escape') setCreating(null)
              }}
            />
            <button className="k-btn primary" onClick={() => void create()}>
              Založit
            </button>
          </div>
        )}
      </div>

      <div className="k-panel">
        {error && <p className="k-notice is-error k-top-notice">{error}</p>}
        {!title ? (
          <p className="k-hint">
            Zatím tu nic není – stáhni pohádky z YouTube nebo založ nový titul.
          </p>
        ) : (
          <>
            {title.id === null ? (
              <p className="k-hint k-loose">
                Videa přímo ve složce Kids, která se nepodařilo zařadit – přesuň je do titulu.
              </p>
            ) : (
              <TitleForm
                key={title.id}
                title={title as KidsTitle & { id: number }}
                folder={folder}
                run={run}
              />
            )}
            <div className="k-vids">
              {title.videos.map((video) => (
                <VideoRow key={video.id} video={video} title={title} titles={titles} run={run} />
              ))}
              {title.videos.length === 0 && <p className="k-hint">V titulu zatím nejsou videa.</p>}
            </div>
            <p className="k-hint">
              Přesunutím se video přesune i na disku do složky titulu. Smazané video jde do Koše.
            </p>
            <div className="k-actions">
              <button className="k-btn" onClick={() => void kids.openFolder()}>
                <FolderOpen size={18} /> Otevřít složku
              </button>
              {title.id !== null && (
                <TrashButton
                  label="Smazat titul"
                  confirm={`Smazat titul${
                    title.videos.length
                      ? ` i ${countOf(title.videos.length, 'video', 'videa', 'videí')}`
                      : ''
                  }?`}
                  onConfirm={() => void run({ kind: 'trash-title', titleId: title.id! })}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
