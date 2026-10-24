import { useEffect, useState } from 'react'
import { Download, Link2, X } from 'lucide-react'
import {
  MAX_PLAYLIST_VIDEOS,
  parseYoutubeLink,
  youtubeThumbnailUrl,
  type KidsPreview,
  type KidsPreviewStage,
  type KidsQuality,
  type KidsQueueItem
} from '../../../shared/kids'
import { countOf } from '../../../shared/plural'
import { formatTime } from '../../../shared/player'
import { useKids } from './KidsData'

const NEW_TITLE = '__novy__'

const STAGE_TEXT: Record<KidsPreviewStage, string> = {
  quick: 'Zjišťuji údaje o videu…',
  tool: 'Připravuji yt-dlp…',
  info: 'Načítám přes yt-dlp…'
}

function queueText(item: KidsQueueItem): string {
  switch (item.status) {
    case 'waiting':
      return `Čeká · ${item.title}`
    case 'downloading': {
      const p = item.progress
      if (!p || p.phase === 'tool') return `Připravuji yt-dlp… · ${item.title}`
      if (p.phase === 'starting') return `Zjišťuji údaje… · ${item.title}`
      if (p.phase === 'merging') return `Spojuji obraz a zvuk… · ${item.title}`
      const parts = [
        `${p.phase === 'audio' ? 'Zvuk' : 'Stahuje se'} ${Math.round(p.percent ?? 0)} %`
      ]
      if (p.speed) parts.push(`${(p.speed / 1024 / 1024).toFixed(1).replace('.', ',')} MB/s`)
      if (p.eta) parts.push(`zbývá ${formatTime(p.eta)}`)
      return `${parts.join(' · ')} → ${item.title}`
    }
    case 'done':
      return `✓ Hotovo · ${item.title}`
    case 'skipped':
      return item.message ?? 'Přeskočeno'
    case 'error':
      return item.message ?? 'Stažení se nepovedlo.'
  }
}

/** Část Pro rodiče → Stáhnout z YouTube: náhled odkazu, zařazení, kvalita a fronta. */
export default function KidsParentDownload(): React.JSX.Element {
  const { kids } = window.kinoteka
  const { titles } = useKids()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<KidsPreviewStage | null>(null)
  const [preview, setPreview] = useState<KidsPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [quality, setQuality] = useState<KidsQuality>('1080')
  const [whole, setWhole] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [queue, setQueue] = useState<KidsQueueItem[]>([])

  useEffect(() => {
    void kids.queue().then(setQueue)
    return kids.onQueueChanged(setQueue)
  }, [kids])

  // yt-dlp se připraví hned při otevření – první náhled pak nečeká na stažení a prověření.
  useEffect(() => {
    void kids.warmUp()
    return kids.onPreviewStage(setStage)
  }, [kids])

  const existing = titles.filter((t) => t.id !== null).map((t) => t.name)
  const valid = parseYoutubeLink(url) !== null

  const load = async (): Promise<void> => {
    setLoading(true)
    setStage(null)
    setPreview(null)
    setError(null)
    setNotice(null)
    const result = await kids.preview(url)
    setLoading(false)
    if (!result.ok) return setError(result.message)
    const found = result.preview
    setPreview(found)
    setWhole(found.kind === 'playlist')
    const suggested = found.suggestedTitle ?? ''
    if (found.suggestedExisting || existing.includes(suggested)) {
      setTarget(suggested)
      setNewTitle('')
    } else {
      setTarget(NEW_TITLE)
      setNewTitle(suggested)
    }
  }

  const title = target === NEW_TITLE ? newTitle.trim() : target
  const download = async (): Promise<void> => {
    if (!preview || !title) return
    const result = await kids.enqueue({
      kind: whole ? 'playlist' : 'video',
      videoId: preview.videoId,
      playlistId: preview.playlist?.id ?? null,
      title,
      quality
    })
    if (!result.ok) return setError(result.message)
    setNotice(
      result.added === 0
        ? 'Všechno už ve složce je.'
        : `Do fronty: ${countOf(result.added, 'video', 'videa', 'videí')}` +
            (result.skipped ? ` (${result.skipped} už ve složce)` : '')
    )
    setPreview(null)
    setUrl('')
  }

  return (
    <div className="k-two">
      <div className="k-panel">
        <h3 className="k-panel-h">Stáhnout z YouTube</h3>
        <div className="k-row">
          <span className="k-field k-input">
            <Link2 size={20} />
            <input
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid && !loading) void load()
              }}
            />
          </span>
          <button className="k-btn grape" disabled={!valid || loading} onClick={() => void load()}>
            {loading ? (stage ? STAGE_TEXT[stage] : 'Načítám…') : 'Načíst'}
          </button>
        </div>
        <p className="k-hint">
          Vlož odkaz na video nebo na playlist. Videa se uloží do složky titulu.
        </p>
        {error && <p className="k-notice is-error">{error}</p>}
        {notice && <p className="k-notice">{notice}</p>}

        {preview && (
          <>
            <div className="k-preview">
              <span
                className="k-preview-thumb"
                style={
                  preview.thumbnailUrl
                    ? { backgroundImage: `url("${preview.thumbnailUrl}")` }
                    : undefined
                }
              >
                {preview.durationSec !== null && (
                  <span className="k-time">{formatTime(preview.durationSec)}</span>
                )}
              </span>
              <div>
                <h4>{preview.title}</h4>
                {preview.channel && <p>{preview.channel}</p>}
                {preview.playlist && (
                  <p className="small">
                    {preview.kind === 'video' ? 'Součást playlistu ' : 'Playlist '}„
                    {preview.playlist.title}“ (
                    {countOf(preview.playlist.count, 'video', 'videa', 'videí')})
                  </p>
                )}
                {preview.playlist && whole && preview.playlist.count > MAX_PLAYLIST_VIDEOS && (
                  <p className="k-warn">
                    Playlist je dlouhý – stáhne se prvních {MAX_PLAYLIST_VIDEOS} videí.
                  </p>
                )}
                {preview.alreadyIn && preview.kind === 'video' && (
                  <p className="k-warn">
                    Tohle video už ve složce je – v titulu „{preview.alreadyIn}“.
                  </p>
                )}
              </div>
            </div>
            <div className="k-form">
              <label>Zařadit do</label>
              <div className="k-row">
                <select
                  className="k-field"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {existing.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value={NEW_TITLE}>Nový titul…</option>
                </select>
                {target === NEW_TITLE && (
                  <input
                    className="k-field"
                    placeholder="Název titulu"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                )}
                {preview.suggestedTitle && title === preview.suggestedTitle && (
                  <span className="k-chip">
                    navrženo podle {preview.suggestedExisting ? 'názvu' : 'kanálu'}
                  </span>
                )}
              </div>
              <label>Kvalita</label>
              <span className="k-seg">
                <button
                  className={quality === '1080' ? 'on' : ''}
                  onClick={() => setQuality('1080')}
                >
                  Nejlepší do 1080p
                </button>
                <button className={quality === '720' ? 'on' : ''} onClick={() => setQuality('720')}>
                  720p (méně místa)
                </button>
              </span>
              {preview.playlist && preview.kind === 'video' && (
                <>
                  <label>Stáhnout</label>
                  <span className="k-seg">
                    <button className={!whole ? 'on' : ''} onClick={() => setWhole(false)}>
                      Jen toto video
                    </button>
                    <button className={whole ? 'on' : ''} onClick={() => setWhole(true)}>
                      Celý playlist ({preview.playlist.count})
                    </button>
                  </span>
                </>
              )}
            </div>
            <div className="k-actions">
              <button className="k-btn" onClick={() => setPreview(null)}>
                Zrušit
              </button>
              <button
                className="k-btn primary"
                disabled={!title || (!whole && preview.alreadyIn !== null)}
                onClick={() => void download()}
              >
                <Download size={18} /> Stáhnout
              </button>
            </div>
          </>
        )}
      </div>

      <div className="k-panel">
        <h3 className="k-panel-h">
          Fronta stahování
          {queue.some((i) => i.status !== 'waiting' && i.status !== 'downloading') && (
            <button className="k-link" onClick={() => void kids.clearFinished()}>
              Vyčistit hotové
            </button>
          )}
        </h3>
        {queue.length === 0 && <p className="k-hint">Zatím nic.</p>}
        <div className="k-queue">
          {queue.map((item) => (
            <div key={item.id} className={`k-q is-${item.status}`}>
              <span
                className="k-q-thumb"
                style={{ backgroundImage: `url("${youtubeThumbnailUrl(item.videoId)}")` }}
              />
              <div className="k-q-info">
                <b>{item.name}</b>
                {item.status === 'downloading' && (
                  <span className="k-pbar">
                    <i style={{ width: `${item.progress?.percent ?? 0}%` }} />
                  </span>
                )}
                <small>{queueText(item)}</small>
              </div>
              {(item.status === 'waiting' || item.status === 'downloading') && (
                <button
                  className="k-x"
                  title={item.status === 'downloading' ? 'Zrušit stahování' : 'Odebrat z fronty'}
                  onClick={() => void kids.removeFromQueue(item.id)}
                >
                  <X size={20} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
