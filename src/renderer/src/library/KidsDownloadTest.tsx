import { useCallback, useEffect, useState } from 'react'
import { Download, FolderOpen, Play } from 'lucide-react'
import {
  parseYoutubeUrl,
  type KidsDownloadProgress,
  type KidsDownloadResult,
  type KidsStatus
} from '../../../shared/kids'
import { formatTime } from '../../../shared/player'

const PHASE: Record<KidsDownloadProgress['phase'], string> = {
  tool: 'Připravuji nástroj yt-dlp (poprvé se stahuje, asi 18 MB)…',
  starting: 'Zjišťuji údaje o videu…',
  video: 'Stahuji obraz',
  audio: 'Stahuji zvuk',
  merging: 'Spojuji obraz a zvuk…'
}

function progressText(progress: KidsDownloadProgress): string {
  const parts = [PHASE[progress.phase]]
  if (progress.percent !== null) parts.push(`${Math.round(progress.percent)} %`)
  if (progress.speed) parts.push(`${(progress.speed / 1024 / 1024).toFixed(1)} MB/s`)
  if (progress.eta !== null && progress.eta > 0) parts.push(`zbývá ${formatTime(progress.eta)}`)
  return parts.join(' · ')
}

/**
 * Přírůstek D1 (dočasné): technický test stahování z YouTube do složky s dětskými videi.
 * Ve verzi 1.1 ho nahradí stahování v části „Pro rodiče“.
 */
export default function KidsDownloadTest(): React.JSX.Element {
  const { kids } = window.kinoteka
  const [status, setStatus] = useState<KidsStatus | null>(null)
  const [url, setUrl] = useState('')
  const [progress, setProgress] = useState<KidsDownloadProgress | null>(null)
  const [result, setResult] = useState<KidsDownloadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)

  const reload = useCallback(() => void kids.status().then(setStatus), [kids])
  useEffect(() => {
    reload()
    return kids.onProgress(setProgress)
  }, [kids, reload])

  const valid = parseYoutubeUrl(url) !== null

  const download = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    setPlayError(null)
    setProgress(null)
    setResult(await kids.download(url))
    setProgress(null)
    setBusy(false)
    reload()
  }

  const play = async (): Promise<void> => {
    if (!result?.ok || !result.videoId) return
    const opened = await kids.playVideo(result.videoId)
    setPlayError(!opened.ok && opened.reason === 'error' ? opened.message : null)
  }

  return (
    <section className="card">
      <h2>Děti – test stahování z YouTube</h2>
      <p className="muted small">
        Dočasný test (přírůstky D1–D2). Video se uloží jako mp4 s obrázkem a údaji z YouTube a
        zařadí se do titulu – podsložky ve složce s dětskými videi.
      </p>
      <dl className="kv">
        <dt>Složka</dt>
        <dd>{status?.folder ?? '…'}</dd>
        <dt>yt-dlp</dt>
        <dd>{status?.ytDlpVersion ?? 'zatím nestažený – stáhne se při prvním stahování'}</dd>
      </dl>
      <div className="key-row kids-url">
        <input
          className="field"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          disabled={busy}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid && !busy) void download()
          }}
        />
        <button className="btn primary" disabled={!valid || busy} onClick={() => void download()}>
          <Download size={16} /> {busy ? 'Stahuji…' : 'Stáhnout'}
        </button>
      </div>
      {url && !valid && <p className="muted small">Vlož odkaz na jedno video z YouTube.</p>}
      {busy && progress && (
        <div className="kids-progress">
          <span className="progress-bar">
            <i style={{ width: `${progress.percent ?? 0}%` }} />
          </span>
          <p className="muted small">{progressText(progress)}</p>
        </div>
      )}
      {result && !result.ok && <p className="notice is-error">{result.message}</p>}
      {result?.ok && (
        <div className="kids-result">
          {result.thumbnail && <img src={result.thumbnail} alt="" />}
          <div>
            <b>{result.title}</b>
            <p className="muted small">
              {[result.channel, result.durationSec !== null && formatTime(result.durationSec)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="muted small mono">{result.fileName}</p>
            <div className="actions">
              <button className="btn sm primary" onClick={() => void play()}>
                <Play size={15} /> Přehrát
              </button>
              <button className="btn sm" onClick={() => void kids.openFolder()}>
                <FolderOpen size={15} /> Otevřít složku
              </button>
            </div>
            {playError && <p className="notice is-error">{playError}</p>}
          </div>
        </div>
      )}
    </section>
  )
}
