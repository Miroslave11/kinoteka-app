import { useEffect, useState } from 'react'
import { Cloud, Download, Link2, X } from 'lucide-react'
import {
  MAX_PLAYLIST_VIDEOS,
  parseYoutubeLink,
  youtubeThumbnailUrl,
  type KidsPreview,
  type KidsPreviewStage,
  type KidsQuality,
  type KidsQueueItem
} from '../../../shared/kids'
import { formatTime } from '../../../shared/player'
import { countOf } from '../../../shared/plural'
import type { YtCategory } from '../../../shared/yt'

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

/** Okno Stáhnout z YouTube: odkaz, náhled, kategorie, kvalita a fronta stahování. */
export default function YtDownload({
  categories,
  onClose
}: {
  categories: YtCategory[]
  onClose: () => void
}): React.JSX.Element {
  const { yt } = window.kinoteka
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<KidsPreviewStage | null>(null)
  const [preview, setPreview] = useState<KidsPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [target, setTarget] = useState(AUTO)
  const [quality, setQuality] = useState<KidsQuality>('1080')
  const [whole, setWhole] = useState(false)
  /** Přidat jen odkaz (výchozí – nezabírá místo), nebo stáhnout do počítače. */
  const [online, setOnline] = useState(true)
  const [queue, setQueue] = useState<KidsQueueItem[]>([])

  useEffect(() => {
    void yt.queue().then(setQueue)
    void yt.status().then((status) => setQuality(status.quality))
    // yt-dlp se připraví hned při otevření – první náhled pak nečeká.
    void yt.warmUp()
    const offQueue = yt.onQueueChanged(setQueue)
    const offStage = yt.onPreviewStage(setStage)
    return () => {
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
  const valid = parseYoutubeLink(url) !== null

  const load = async (): Promise<void> => {
    setLoading(true)
    setStage(null)
    setPreview(null)
    setError(null)
    setNotice(null)
    const result = await yt.preview(url)
    setLoading(false)
    if (!result.ok) return setError(result.message)
    setPreview(result.preview)
    setWhole(result.preview.kind === 'playlist')
    setTarget(AUTO)
  }

  const [adding, setAdding] = useState(false)
  const download = async (): Promise<void> => {
    if (!preview) return
    const request = {
      kind: whole ? ('playlist' as const) : ('video' as const),
      videoId: preview.videoId,
      playlistId: preview.playlist?.id ?? null,
      title: target,
      quality
    }
    setAdding(true)
    const result = online ? await yt.addOnline(request) : await yt.enqueue(request)
    setAdding(false)
    if (!result.ok) return setError(result.message)
    const count = countOf(result.added, 'video', 'videa', 'videí')
    setNotice(
      result.added === 0
        ? 'Všechno už máš.'
        : (online ? `Přidáno online: ${count}` : `Do fronty: ${count}`) +
            (result.skipped ? ` (${result.skipped} už máš)` : '')
    )
    setPreview(null)
    setUrl('')
  }

  const autoHint = preview?.suggestedTitle
    ? `Automaticky (nejspíš ${preview.suggestedTitle})`
    : 'Automaticky podle obsahu'

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
            <input
              autoFocus
              aria-label="Odkaz na video nebo playlist"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid && !loading) void load()
              }}
            />
          </span>
          <button className="btn sm" disabled={!valid || loading} onClick={() => void load()}>
            {loading ? (stage ? STAGE_TEXT[stage] : 'Načítám…') : 'Načíst'}
          </button>
        </div>
        {error && <p className="notice is-error">{error}</p>}
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
                {preview.alreadyIn && preview.kind === 'video' && (
                  <p className="notice">Tohle video už máš – v kategorii „{preview.alreadyIn}“.</p>
                )}
              </div>
            </div>

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
              <button
                className={`chip ${target === AUTO ? 'on' : ''}`}
                onClick={() => setTarget(AUTO)}
              >
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

            <label className="yt-label">
              {online ? 'Kvalita přehrávání' : 'Kvalita stahování'}
            </label>
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
                disabled={adding || (!whole && preview.alreadyIn !== null)}
                onClick={() => void download()}
              >
                {online ? <Cloud size={16} /> : <Download size={16} />}{' '}
                {adding ? 'Přidávám…' : online ? 'Přidat online' : 'Stáhnout'}
              </button>
            </div>
          </div>
        )}

        <div className="yt-queue-head">
          <h4>Fronta stahování</h4>
          {queue.some((i) => i.status !== 'waiting' && i.status !== 'downloading') && (
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
              {(item.status === 'waiting' || item.status === 'downloading') && (
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
