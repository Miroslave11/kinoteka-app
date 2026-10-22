import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { FileDetails } from '../../../shared/catalog'
import { languageName } from '../../../shared/languages'
import { formatSize } from '../../../shared/library'
import { audioLabel, formatBitrate, resolutionLabel } from '../../../shared/mediaInfo'
import { formatTime } from '../../../shared/player'

interface Props {
  fileId: number
  onClose: () => void
}

/** Panel „Vlastnosti souboru“ – technické údaje z ffprobe. */
export default function FileDetailsDialog({ fileId, onClose }: Props): React.JSX.Element {
  const [details, setDetails] = useState<FileDetails | null | undefined>(undefined)

  useEffect(() => {
    const { catalog, library } = window.kinoteka
    const load = (): void => void catalog.getFileDetails(fileId).then(setDetails)
    load()
    // Analýza může doběhnout, zatímco je panel otevřený.
    return library.onChanged(load)
  }, [fileId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const info = details?.info

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="Vlastnosti souboru"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>Vlastnosti souboru</h3>
          <button className="icon-btn sm" onClick={onClose} title="Zavřít (Esc)">
            <X size={16} />
          </button>
        </header>
        {details === undefined && <p className="empty">Načítám…</p>}
        {details === null && <p className="empty">Soubor už v knihovně není.</p>}
        {details && (
          <dl className="kv">
            <dt>Soubor</dt>
            <dd className="mono">{details.file.fileName}</dd>
            <dt>Umístění</dt>
            <dd className="mono" title={details.path}>
              {details.folderName}{' '}
              {details.folderKind === 'network' ? '(síťová složka)' : '(lokální disk)'}
              {details.file.relativePath.includes('\\') &&
                ` \\ ${details.file.relativePath.slice(0, details.file.relativePath.lastIndexOf('\\'))}`}
            </dd>
            <dt>Velikost</dt>
            <dd>
              {formatSize(details.file.size)}
              {info &&
                ` · ${info.container} · ${formatTime(info.durationSec)} · ${formatBitrate(info.bitrate)}`}
            </dd>

            {details.pending && (
              <>
                <dt>Analýza</dt>
                <dd className="muted">Probíhá na pozadí, údaje se zobrazí za chvíli…</dd>
              </>
            )}
            {details.error && (
              <>
                <dt>Analýza</dt>
                <dd className="warn">Vlastnosti nejde zjistit: {details.error}</dd>
              </>
            )}

            {info?.video && (
              <>
                <dt>Video</dt>
                <dd className="track">
                  <span className="badge hl">
                    {resolutionLabel(info.video.width, info.video.height)}
                  </span>
                  {info.video.hdr && <span className="badge hl">{info.video.hdr}</span>}
                  {info.video.codec} · {info.video.width}×{info.video.height}
                  {info.video.fps && ` · ${info.video.fps.toLocaleString('cs-CZ')} fps`}
                  {info.video.bitDepth && ` · ${info.video.bitDepth} bit`}
                  {info.video.bitrate && ` · ${formatBitrate(info.video.bitrate)}`}
                </dd>
              </>
            )}
            {info?.audio.map((track) => (
              <AudioRow key={track.number} label={`Zvuk ${track.number}`}>
                <span className="badge">{track.language?.toUpperCase() ?? '?'}</span>
                {audioLabel(track)} · {languageName(track.language)}
                {track.title && ` · „${track.title}“`}
                {track.bitrate && ` · ${formatBitrate(track.bitrate)}`}
                {track.default && <span className="muted"> · výchozí</span>}
              </AudioRow>
            ))}
            {info && info.audio.length === 0 && (
              <>
                <dt>Zvuk</dt>
                <dd className="muted">bez zvukové stopy</dd>
              </>
            )}
            {info?.subtitles.map((track) => (
              <AudioRow key={`s${track.number}`} label={`Titulky ${track.number}`}>
                <span className="badge">{track.language?.toUpperCase() ?? '?'}</span>
                {track.codec} · {languageName(track.language)}
                {track.title && ` · „${track.title}“`}
                {track.forced && ' · vynucené'}
                {track.image && <span className="muted"> · obrázkové (nejde stylovat)</span>}
              </AudioRow>
            ))}
            {info && info.subtitles.length === 0 && (
              <>
                <dt>Titulky</dt>
                <dd className="muted">v souboru žádné (externí .srt se načtou v přehrávači)</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </div>
  )
}

function AudioRow({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <>
      <dt>{label}</dt>
      <dd className="track">{children}</dd>
    </>
  )
}
