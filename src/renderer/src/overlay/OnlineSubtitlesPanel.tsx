import { useEffect, useState } from 'react'
import { Download, LoaderCircle, X } from 'lucide-react'
import { languageName } from '../../../shared/languages'
import type { OnlineSearchResult, OnlineSubtitle } from '../../../shared/onlineSubtitles'

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Kolik výsledků ukázat – víc obvykle nepomůže. */
const SHOWN = 30

/** Hledání titulků na OpenSubtitles.com k právě hranému souboru. */
export default function OnlineSubtitlesPanel({
  onClose
}: {
  onClose: () => void
}): React.JSX.Element {
  const { onlineSubtitles } = window.kinoteka
  const [result, setResult] = useState<OnlineSearchResult | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    void onlineSubtitles.search().then(setResult)
  }, [onlineSubtitles])

  const download = async (subtitle: OnlineSubtitle): Promise<void> => {
    setDownloading(subtitle.fileId)
    setMessage(null)
    const done = await onlineSubtitles.download(subtitle.fileId)
    setDownloading(null)
    if (!done.ok) {
      setMessage({ text: done.message, error: true })
      return
    }
    const where =
      done.savedTo === 'video-folder'
        ? `uloženy vedle filmu jako ${done.fileName}`
        : 'uloženy v datech aplikace (do složky s filmem nešlo zapisovat)'
    const left = done.remaining !== null ? ` Dnes zbývá ${done.remaining} stažení.` : ''
    setMessage({ text: `Titulky jsou zapnuté a ${where}.${left}`, error: false })
    window.setTimeout(onClose, 2500)
  }

  return (
    <div
      className="online-subs"
      role="dialog"
      aria-label="Titulky z internetu"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <header>
        <h4>
          Titulky z internetu
          {result?.ok && <small>{result.query}</small>}
        </h4>
        <button className="icon-btn xs" onClick={onClose} title="Zavřít (Esc)">
          <X size={16} />
        </button>
      </header>

      {!result && (
        <p className="online-state">
          <LoaderCircle size={16} className="spin" /> Hledám na OpenSubtitles.com…
        </p>
      )}
      {result && !result.ok && <p className="online-state error">{result.message}</p>}
      {result?.ok && result.subtitles.length === 0 && (
        <p className="online-state">
          Pro tento film nebo díl se v preferovaných jazycích nic nenašlo.
        </p>
      )}
      {message && (
        <p className={`online-state ${message.error ? 'error' : 'ok'}`}>{message.text}</p>
      )}

      {result?.ok && result.subtitles.length > 0 && (
        <div className="online-list">
          {result.subtitles.slice(0, SHOWN).map((subtitle) => (
            <button
              key={subtitle.fileId}
              className="online-item"
              disabled={downloading !== null}
              onClick={() => void download(subtitle)}
              title={subtitle.release}
            >
              <span className="online-lang">{capitalize(languageName(subtitle.language))}</span>
              <span className="online-release">{subtitle.release || 'bez názvu vydání'}</span>
              <span className="online-tags">
                {subtitle.hashMatch && <i className="ok">sedí na soubor</i>}
                {subtitle.trusted && <i>ověřený autor</i>}
                {subtitle.machineTranslated && <i className="warn">strojový překlad</i>}
                {subtitle.hearingImpaired && <i>pro neslyšící</i>}
                <span>{subtitle.downloads.toLocaleString('cs-CZ')}× staženo</span>
              </span>
              {downloading === subtitle.fileId ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
            </button>
          ))}
        </div>
      )}
      <p className="online-note">Zdroj: OpenSubtitles.com</p>
    </div>
  )
}
