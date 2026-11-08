import { useEffect, useRef, useState } from 'react'
import { Cloud, Download, Link2, Pause, Play, RotateCcw, X } from 'lucide-react'
import {
  MAX_PLAYLIST_VIDEOS,
  parseYoutubeLink,
  youtubeThumbnailUrl,
  type KidsDownloadRequest,
  type KidsPreview,
  type KidsPreviewStage,
  type KidsQuality,
  type KidsQueueItem
} from '../../../shared/kids'
import { formatTime } from '../../../shared/player'
import { countOf } from '../../../shared/plural'
import { MAX_BULK_LINKS, splitLinks, type YtCategory } from '../../../shared/yt'

/** Zařazení podle obsahu po stažení (štítky, popis) – video se stáhne do kořene složky. */
const AUTO = ''

const STAGE_TEXT: Record<KidsPreviewStage, string> = {
  quick: 'Zjišťuji údaje o videu…',
  tool: 'Připravuji yt-dlp…',
  info: 'Načítám přes yt-dlp…'
}

const QUALITIES: [KidsQuality, string][] = [
  ['720', '720p'],
  ['1080', '1080p'],
  ['2160', '4K']
]

const where = (item: KidsQueueItem): string => item.title || 'podle obsahu'

function queueText(item: KidsQueueItem): string {
  switch (item.status) {
    case 'waiting':
      return `Čeká · ${where(item)}`
    case 'paused':
      return `Pozastaveno · ${where(item)}`
    case 'downloading': {
      const p = item.progress
      if (!p || p.phase === 'tool') return `Připravuji yt-dlp… · ${where(item)}`
      if (p.phase === 'starting') return `Zjišťuji údaje… · ${where(item)}`
      if (p.phase === 'merging') return `Spojuji obraz a zvuk… · ${where(item)}`
      const parts = [
        `${p.phase === 'audio' ? 'Zvuk' : 'Stahuje se'} ${Math.round(p.percent ?? 0)} %`
      ]
      if (p.speed) parts.push(`${(p.speed / 1024 / 1024).toFixed(1).replace('.', ',')} MB/s`)
      if (p.eta) parts.push(`zbývá ${formatTime(p.eta)}`)
      return `${parts.join(' · ')} → ${where(item)}`
    }
    case 'done':
      return `✓ Hotovo · ${where(item)}`
    case 'skipped':
      return item.message ?? 'Přeskočeno'
    case 'error':
      return item.message ?? 'Stažení se nepovedlo.'
  }
}

/** Jeden odkaz z hromadného vložení: načtený náhled, nebo chyba. */
interface BulkRow {
  url: string
  preview: KidsPreview | null
  error: string | null
  checked: boolean
}

/** Video už je v knihovně (stažené, nebo – při přidávání online – jako odkaz). */
function haveIn(preview: KidsPreview, online: boolean): string | null {
  if (preview.kind !== 'video') return null
  return preview.alreadyIn ?? (online ? (preview.alreadyOnline ?? null) : null)
}

/** Požadavek na přidání: celý playlist (odkaz jen na playlist), jinak jedno video. */
const requestFor = (
  preview: KidsPreview,
  whole: boolean,
  title: string,
  quality: KidsQuality
): KidsDownloadRequest => ({
  kind: whole ? 'playlist' : 'video',
  videoId: preview.videoId,
  playlistId: preview.playlist?.id ?? null,
  title,
  quality
})

/** Okno Přidat z YouTube: odkaz (nebo víc odkazů), náhled, kategorie, kvalita a fronta. */
export default function YtDownload({
  categories,
  onClose
}: {
  categories: YtCategory[]
  onClose: () => void
}): React.JSX.Element {
  const { yt } = window.kinoteka
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<KidsPreviewStage | null>(null)
  const [preview, setPreview] = useState<KidsPreview | null>(null)
  const [bulk, setBulk] = useState<BulkRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [target, setTarget] = useState(AUTO)
  const [quality, setQuality] = useState<KidsQuality>('1080')
  const [whole, setWhole] = useState(false)
  /** Přidat jen odkaz (výchozí – nezabírá místo), nebo stáhnout do počítače. */
  const [online, setOnline] = useState(true)
  const [queue, setQueue] = useState<KidsQueueItem[]>([])
  const [adding, setAdding] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  /** Okno zavřené během načítání víc odkazů – další už nenačítat. */
  const closed = useRef(false)

  useEffect(() => {
    closed.current = false
    void yt.queue().then(setQueue)
    void yt.status().then((status) => setQuality(status.quality))
    // yt-dlp se připraví hned při otevření – první náhled pak nečeká.
    void yt.warmUp()
    const offQueue = yt.onQueueChanged(setQueue)
    const offStage = yt.onPreviewStage(setStage)
    return () => {
      closed.current = true
      offQueue()
      offStage()
    }
  }, [yt])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const named = categories.filter((c) => c.id !== null)
  const parts = splitLinks(text)
  const links = parts.filter((part) => parseYoutubeLink(part) !== null)
  const invalid = parts.length - links.length
  const many = links.length > 1

  const reset = (): void => {
    setStage(null)
    setPreview(null)
    setBulk(null)
    setError(null)
    setNotice(null)
    setTarget(AUTO)
  }

  const loadOne = async (url: string): Promise<void> => {
    const result = await yt.preview(url)
    if (!result.ok) return setError(result.message)
    setPreview(result.preview)
    setWhole(result.preview.kind === 'playlist')
  }

  /** Víc odkazů: náhledy jeden po druhém (yt-dlp najednou by zahltil počítač). */
  const loadMany = async (urls: string[]): Promise<void> => {
    const rows: BulkRow[] = urls.map((url) => ({ url, preview: null, error: null, checked: false }))
    setBulk(rows)
    for (const [index, url] of urls.entries()) {
      if (closed.current) return
      const result = await yt.preview(url)
      rows[index] = result.ok
        ? {
            url,
            preview: result.preview,
            error: null,
            checked: haveIn(result.preview, online) === null
          }
        : { url, preview: null, error: result.message, checked: false }
      setBulk([...rows])
    }
  }

  const load = async (): Promise<void> => {
    if (links.length === 0) return
    reset()
    setLoading(true)
    if (many) await loadMany(links.slice(0, MAX_BULK_LINKS))
    else await loadOne(links[0]!)
    setLoading(false)
  }

  const finish = (added: number, skipped: number): void => {
    const count = countOf(added, 'video', 'videa', 'videí')
    setNotice(
      added === 0
        ? 'Všechno už máš.'
        : (online ? `Přidáno online: ${count}` : `Do fronty: ${count}`) +
            (skipped ? ` (${skipped} už máš)` : '')
    )
    setPreview(null)
    setBulk(null)
    setText('')
  }

  const add = async (
    request: KidsDownloadRequest
  ): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }> =>
    online ? yt.addOnline(request) : yt.enqueue(request)

  const addOne = async (): Promise<void> => {
    if (!preview) return
    setAdding(true)
    const result = await add(requestFor(preview, whole, target, quality))
    setAdding(false)
    if (!result.ok) return setError(result.message)
    finish(result.added, result.skipped)
  }

  const chosen = (bulk ?? []).filter((row) => row.checked && row.preview)
  const addChosen = async (): Promise<void> => {
    setAdding(true)
    let added = 0
    let skipped = 0
    const failed: string[] = []
    for (const row of chosen) {
      const p = row.preview!
      const result = await add(requestFor(p, p.kind === 'playlist', target, quality))
      if (result.ok) {
        added += result.added
        skipped += result.skipped
      } else failed.push(`${p.title}: ${result.message}`)
    }
    setAdding(false)
    finish(added, skipped)
    if (failed.length > 0) setError(failed.join('\n'))
  }

  const toggle = (index: number): void =>
    setBulk((rows) =>
      rows ? rows.map((row, i) => (i === index ? { ...row, checked: !row.checked } : row)) : rows
    )

  const autoHint = preview?.suggestedTitle
    ? `Automaticky (nejspíš ${preview.suggestedTitle})`
    : 'Automaticky podle obsahu'

  const options = (
    <>
      <label className="yt-label">Uložit</label>
      <div className="yt-seg">
        <button className={`chip ${online ? 'on' : ''}`} onClick={() => setOnline(true)}>
          <Cloud size={14} /> Jen odkaz – online (nezabírá místo)
        </button>
        <button className={`chip ${!online ? 'on' : ''}`} onClick={() => setOnline(false)}>
          <Download size={14} /> Stáhnout do počítače
        </button>
      </div>
      <p className="muted small">
        {online
          ? 'Video se přehraje přímo z YouTube (potřebuje internet). Na disk se uloží jen odkaz a náhled.'
          : 'Video se stáhne celé – jde přehrát i bez internetu, ale zabírá místo.'}
      </p>

      <label className="yt-label">Kategorie</label>
      <div className="yt-seg">
        <button className={`chip ${target === AUTO ? 'on' : ''}`} onClick={() => setTarget(AUTO)}>
          {autoHint}
        </button>
        {named.map((category) => (
          <button
            key={category.id}
            className={`chip ${target === category.name ? 'on' : ''}`}
            onClick={() => setTarget(category.name)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <p className="muted small">
        Automaticky = podle štítků, názvu a popisu z YouTube (zjistí se po přidání).
      </p>

      <label className="yt-label">{online ? 'Kvalita přehrávání' : 'Kvalita stahování'}</label>
      <div className="yt-seg">
        {QUALITIES.map(([value, label]) => (
          <button
            key={value}
            className={`chip ${quality === value ? 'on' : ''}`}
            onClick={() => setQuality(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {quality === '2160' && (
        <p className="muted small">
          {online
            ? '4K potřebuje rychlý internet (kolem 25 Mb/s) a na slabším počítači se nemusí přehrávat plynule.'
            : '4K zabere hodně místa a na slabším počítači se nemusí přehrávat plynule.'}
        </p>
      )}
    </>
  )

  const pending = queue.filter(
    (i) => i.status === 'waiting' || i.status === 'downloading' || i.status === 'paused'
  )
  const active = queue.some((i) => i.status === 'waiting' || i.status === 'downloading')
  const paused = queue.some((i) => i.status === 'paused')
  const failedCount = queue.filter((i) => i.status === 'error').length
  const finished = queue.some((i) => i.status === 'done' || i.status === 'skipped')
  const loadedCount = (bulk ?? []).filter((row) => row.preview || row.error).length

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog yt-download"
        role="dialog"
        aria-label="Přidat z YouTube"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="yt-download-head">
          <h3>Přidat z YouTube</h3>
          <button className="icon-btn" title="Zavřít (Esc)" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="key-row">
          <span className="field grow yt-url">
            <Link2 size={16} />
            <textarea
              autoFocus
              rows={Math.min(6, Math.max(1, text.split('\n').length))}
              aria-label="Odkaz na video nebo playlist (víc odkazů – každý na řádek)"
              placeholder="https://www.youtube.com/watch?v=…  (víc odkazů – každý na nový řádek)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter načte; Shift+Enter = nový řádek pro další odkaz.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (links.length > 0 && !loading) void load()
                }
              }}
            />
          </span>
          <button
            className="btn sm"
            disabled={links.length === 0 || loading}
            onClick={() => void load()}
          >
            {loading
              ? bulk
                ? `Načítám ${loadedCount + 1} z ${bulk.length}…`
                : stage
                  ? STAGE_TEXT[stage]
                  : 'Načítám…'
              : many
                ? `Načíst ${countOf(Math.min(links.length, MAX_BULK_LINKS), 'odkaz', 'odkazy', 'odkazů')}`
                : 'Načíst'}
          </button>
        </div>
        {(invalid > 0 || links.length > MAX_BULK_LINKS) && (
          <p className="muted small">
            {invalid > 0 &&
              `${countOf(invalid, 'řádek není', 'řádky nejsou', 'řádků není')} odkaz na YouTube – přeskočí se. `}
            {links.length > MAX_BULK_LINKS && `Načte se jen prvních ${MAX_BULK_LINKS} odkazů.`}
          </p>
        )}
        {error && <p className="notice is-error yt-error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {preview && (
          <div className="yt-preview">
            <div className="yt-preview-top">
              <span
                className="yt-preview-thumb"
                style={
                  preview.thumbnailUrl
                    ? { backgroundImage: `url("${preview.thumbnailUrl}")` }
                    : undefined
                }
              >
                {preview.durationSec !== null && (
                  <span className="badge glass yt-length">{formatTime(preview.durationSec)}</span>
                )}
              </span>
              <div>
                <b>{preview.title}</b>
                {preview.channel && <p className="muted small">{preview.channel}</p>}
                {preview.playlist && (
                  <p className="muted small">
                    {preview.kind === 'video' ? 'Součást playlistu ' : 'Playlist '}„
                    {preview.playlist.title}“ (
                    {countOf(preview.playlist.count, 'video', 'videa', 'videí')})
                  </p>
                )}
                {preview.playlist && whole && preview.playlist.count > MAX_PLAYLIST_VIDEOS && (
                  <p className="notice">
                    Playlist je dlouhý – stáhne se prvních {MAX_PLAYLIST_VIDEOS} videí.
                  </p>
                )}
                {haveIn(preview, online) && (
                  <p className="notice">
                    Tohle video už máš – v kategorii „{haveIn(preview, online)}“.
                  </p>
                )}
              </div>
            </div>

            {options}

            {preview.playlist && preview.kind === 'video' && (
              <>
                <label className="yt-label">Které video</label>
                <div className="yt-seg">
                  <button className={`chip ${!whole ? 'on' : ''}`} onClick={() => setWhole(false)}>
                    Jen toto video
                  </button>
                  <button className={`chip ${whole ? 'on' : ''}`} onClick={() => setWhole(true)}>
                    Celý playlist ({preview.playlist.count})
                  </button>
                </div>
              </>
            )}

            <div className="actions">
              <button className="btn sm" onClick={() => setPreview(null)}>
                Zrušit
              </button>
              <button
                className="btn sm primary"
                disabled={adding || (!whole && haveIn(preview, online) !== null)}
                onClick={() => void addOne()}
              >
                {online ? <Cloud size={16} /> : <Download size={16} />}{' '}
                {adding ? 'Přidávám…' : online ? 'Přidat online' : 'Stáhnout'}
              </button>
            </div>
          </div>
        )}

        {bulk && (
          <div className="yt-preview">
            <div className="yt-bulk">
              {bulk.map((row, index) => {
                const have = row.preview ? haveIn(row.preview, online) : null
                return (
                  <label
                    key={row.url}
                    className={`yt-bulk-row ${row.error ? 'is-error' : ''}`}
                    title={row.url}
                  >
                    <input
                      type="checkbox"
                      checked={row.checked}
                      disabled={!row.preview}
                      onChange={() => toggle(index)}
                    />
                    <span
                      className="yt-q-thumb"
                      style={
                        row.preview?.thumbnailUrl
                          ? { backgroundImage: `url("${row.preview.thumbnailUrl}")` }
                          : undefined
                      }
                    />
                    <span className="yt-q-info">
                      <b>{row.preview?.title ?? row.url}</b>
                      <small className={row.error ? 'is-error' : 'muted'}>
                        {row.error ??
                          (!row.preview
                            ? 'Čeká na načtení…'
                            : [
                                row.preview.kind === 'playlist' && row.preview.playlist
                                  ? `Playlist · ${countOf(row.preview.playlist.count, 'video', 'videa', 'videí')}`
                                  : row.preview.channel,
                                row.preview.durationSec !== null
                                  ? formatTime(row.preview.durationSec)
                                  : null,
                                have ? `už máš v „${have}“` : null
                              ]
                                .filter(Boolean)
                                .join(' · '))}
                      </small>
                    </span>
                  </label>
                )
              })}
            </div>

            {options}

            <div className="actions">
              <button className="btn sm" onClick={() => setBulk(null)}>
                Zrušit
              </button>
              <button
                className="btn sm primary"
                disabled={adding || loading || chosen.length === 0}
                onClick={() => void addChosen()}
              >
                {online ? <Cloud size={16} /> : <Download size={16} />}{' '}
                {adding
                  ? 'Přidávám…'
                  : `${online ? 'Přidat online' : 'Stáhnout'} vybrané (${chosen.length})`}
              </button>
            </div>
          </div>
        )}

        <div className="yt-queue-head">
          <h4>Fronta stahování</h4>
          {active && (
            <button
              className="row-link"
              onClick={() => void yt.controlQueue({ kind: 'pause' })}
              title="Rozpracované soubory zůstanou, stahování půjde dokončit"
            >
              <Pause size={14} /> Pozastavit vše
            </button>
          )}
          {paused && (
            <button className="row-link" onClick={() => void yt.controlQueue({ kind: 'resume' })}>
              <Play size={14} /> Pokračovat
            </button>
          )}
          {failedCount > 0 && (
            <button
              className="row-link"
              onClick={() => void yt.controlQueue({ kind: 'retry', id: null })}
            >
              <RotateCcw size={14} /> Zkusit znovu chybné ({failedCount})
            </button>
          )}
          {pending.length > 0 && (
            <button
              className={`row-link ${confirmCancel ? 'is-danger' : ''}`}
              onBlur={() => setConfirmCancel(false)}
              onClick={() => {
                if (!confirmCancel) return setConfirmCancel(true)
                setConfirmCancel(false)
                void yt.controlQueue({ kind: 'cancel-all' })
              }}
            >
              <X size={14} /> {confirmCancel ? `Opravdu zrušit ${pending.length}?` : 'Zrušit vše'}
            </button>
          )}
          {(finished || failedCount > 0) && (
            <button className="row-link" onClick={() => void yt.clearFinished()}>
              Vyčistit hotové
            </button>
          )}
        </div>
        {queue.length === 0 && <p className="muted small">Zatím nic.</p>}
        <div className="yt-queue">
          {queue.map((item) => (
            <div key={item.id} className={`yt-q is-${item.status}`}>
              <span
                className="yt-q-thumb"
                style={{ backgroundImage: `url("${youtubeThumbnailUrl(item.videoId)}")` }}
              />
              <div className="yt-q-info">
                <b>{item.name}</b>
                {item.status === 'downloading' && (
                  <span className="progress-bar">
                    <i style={{ width: `${item.progress?.percent ?? 0}%` }} />
                  </span>
                )}
                <small className={item.status === 'error' ? 'is-error' : 'muted'}>
                  {queueText(item)}
                </small>
              </div>
              {item.status === 'error' && (
                <button
                  className="icon-btn xs"
                  title="Zkusit znovu"
                  onClick={() => void yt.controlQueue({ kind: 'retry', id: item.id })}
                >
                  <RotateCcw size={14} />
                </button>
              )}
              {(item.status === 'waiting' ||
                item.status === 'downloading' ||
                item.status === 'paused') && (
                <button
                  className="icon-btn xs"
                  title={item.status === 'downloading' ? 'Zrušit stahování' : 'Odebrat z fronty'}
                  onClick={() => void yt.removeFromQueue(item.id)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
