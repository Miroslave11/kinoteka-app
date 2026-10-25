import { useEffect, useState, type FormEvent } from 'react'
import { Download, FolderOpen, RotateCcw, VolumeX, X } from 'lucide-react'
import type { ThemeInfo, ThemeResult } from '../../../shared/theme'
import { displayName, type TitleItem } from '../app/catalogData'

const SOURCE_TEXT: Record<string, string> = {
  local: 'Hraje melodie uložená u souborů titulu.',
  file: 'Hraje zvukový soubor vybraný v aplikaci.',
  youtube: 'Hraje melodie stažená z YouTube.',
  none: 'Titul je bez melodie.'
}

/** „Melodie…“: vlastní soubor, odkaz z YouTube, nebo bez melodie. */
export default function ThemeDialog({
  title,
  onClose,
  onChanged
}: {
  title: TitleItem
  onClose: () => void
  /** Melodie se změnila – stránka ji pustí znovu. */
  onChanged: () => void
}): React.JSX.Element {
  const { theme } = window.kinoteka
  const [info, setInfo] = useState<ThemeInfo | null>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<'file' | 'youtube' | 'other' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void theme.info(title.id).then(setInfo)
  }, [theme, title.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && busy !== 'youtube') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const run = async (
    kind: 'file' | 'youtube' | 'other',
    action: () => Promise<ThemeResult | ThemeInfo | null>
  ): Promise<void> => {
    setBusy(kind)
    setError(null)
    try {
      const result = await action()
      if (!result) return
      if ('ok' in result) {
        if (!result.ok) {
          setError(result.message)
          return
        }
        setInfo(result.info)
      } else setInfo(result)
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const download = (event: FormEvent): void => {
    event.preventDefault()
    void run('youtube', async () => {
      const result = await theme.setYoutube(title.id, link)
      if (result.ok) setLink('')
      return result
    })
  }

  const manual = info?.source === 'file' || info?.source === 'youtube' || info?.source === 'none'

  return (
    <div className="dialog-backdrop" onClick={() => busy !== 'youtube' && onClose()}>
      <div
        className="dialog theme-dialog"
        role="dialog"
        aria-label="Ústřední melodie"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>Ústřední melodie</h3>
          <button className="icon-btn sm" onClick={onClose} title="Zavřít (Esc)">
            <X size={16} />
          </button>
        </header>
        <p className="muted">
          {title.kind === 'movie' ? 'Film' : 'Seriál'} „{displayName(title)}“.{' '}
          {info ? (SOURCE_TEXT[info.source ?? ''] ?? 'Melodie zatím není.') : 'Zjišťuji…'}
        </p>
        {info?.source === 'youtube' && info.link && (
          <p className="small">
            <a href={info.link} target="_blank" rel="noreferrer">
              {info.link}
            </a>
          </p>
        )}

        <div className="theme-actions">
          <button
            className="btn sm"
            disabled={busy !== null}
            onClick={() => void run('file', () => theme.pickFile(title.id))}
          >
            <FolderOpen size={16} /> Vybrat soubor…
          </button>
          {info?.source !== 'none' && (
            <button
              className="btn sm"
              disabled={busy !== null}
              onClick={() => void run('other', () => theme.setNone(title.id))}
            >
              <VolumeX size={16} /> Bez melodie
            </button>
          )}
          {manual && (
            <button
              className="btn sm"
              disabled={busy !== null}
              onClick={() => void run('other', () => theme.reset(title.id))}
              title="Zrušit ruční volbu – znovu platí soubor uložený u filmu, pokud nějaký je"
            >
              <RotateCcw size={16} /> Původní
            </button>
          )}
        </div>

        <form className="search-form" onSubmit={download}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Odkaz na video z YouTube s melodií"
            disabled={busy !== null}
          />
          <button className="btn sm primary" disabled={busy !== null || !link.trim()}>
            <Download size={16} /> {busy === 'youtube' ? 'Stahuji…' : 'Stáhnout'}
          </button>
        </form>
        {busy === 'youtube' && (
          <p className="muted small">
            Stahuje se jen zvuk ze začátku videa (asi minuta a půl). Poprvé se může stahovat i
            nástroj yt-dlp.
          </p>
        )}
        {error && <p className="notice is-error">{error}</p>}

        <p className="muted small">
          Melodii můžeš uložit i vedle filmu: pojmenuj ji stejně jako soubor filmu a místo jeho
          koncovky dej <code>.theme.mp3</code> (např. <code>Matrix (1999).theme.mp3</code>), u
          seriálu <code>theme.mp3</code> ve složce seriálu. Stahováním z YouTube souhlasíš s jeho
          podmínkami – používej jen pro vlastní potřebu.
        </p>

        <div className="dialog-foot">
          <button className="btn sm" onClick={onClose} disabled={busy === 'youtube'}>
            Zavřít
          </button>
        </div>
      </div>
    </div>
  )
}
