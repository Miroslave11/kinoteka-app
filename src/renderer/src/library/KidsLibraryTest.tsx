import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react'
import { countOf } from '../../../shared/plural'
import { formatTime } from '../../../shared/player'
import { Link } from 'react-router'
import {
  KIDS_THEMES,
  type KidsScanResult,
  type KidsSettings,
  type KidsTheme,
  type KidsTitle
} from '../../../shared/kids'
import { placeholderStyle } from '../app/palette'

/**
 * Přírůstek D2 (dočasné): tituly dětské části, jak je aplikace rozpoznala ve složce Kids.
 * Ve verzi 1.1 je nahradí dětská obrazovka Domů (D3).
 */
export default function KidsLibraryTest(): React.JSX.Element {
  const { kids } = window.kinoteka
  const [titles, setTitles] = useState<KidsTitle[]>([])
  const [open, setOpen] = useState<number | null | undefined>(undefined)
  const [scan, setScan] = useState<KidsScanResult | null>(null)
  const [scanning, setScanning] = useState(false)

  const reload = useCallback(() => void kids.listTitles().then(setTitles), [kids])
  useEffect(() => {
    reload()
    return kids.onChanged(reload)
  }, [kids, reload])

  const [settings, setSettings] = useState<KidsSettings | null>(null)
  useEffect(() => void kids.getSettings().then(setSettings), [kids])
  const chooseTheme = async (theme: KidsTheme): Promise<void> => {
    if (settings) setSettings(await kids.saveSettings({ ...settings, theme }))
  }

  const rescan = async (): Promise<void> => {
    setScanning(true)
    setScan(await kids.scan())
    setScanning(false)
  }

  const videoCount = titles.reduce((sum, t) => sum + t.videos.length, 0)

  return (
    <section className="card">
      <h2>Děti – tituly ve složce</h2>
      <p className="muted small">
        Každá podsložka je jeden titul. Videa položená přímo do složky aplikace zařadí podle kanálu,
        playlistu nebo názvu z YouTube a přesune je do podsložky titulu.
      </p>
      <div className="actions">
        <Link className="btn sm primary" to="/deti">
          Otevřít dětský režim
        </Link>
        <select
          className="field"
          value={settings?.theme ?? ''}
          onChange={(event) => void chooseTheme(event.target.value as KidsTheme)}
          title="Motiv dětské části"
        >
          {KIDS_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              Motiv: {theme.label}
            </option>
          ))}
        </select>
        <button className="btn sm" disabled={scanning} onClick={() => void rescan()}>
          <RefreshCw size={15} className={scanning ? 'spin' : ''} /> Prohledat složku
        </button>
        <span className="muted small">
          {countOf(titles.filter((t) => t.id !== null).length, 'titul', 'tituly', 'titulů')} ·{' '}
          {countOf(videoCount, 'video', 'videa', 'videí')}
          {scan &&
            scan.sorted > 0 &&
            ` · zařazeno ${countOf(scan.sorted, 'video', 'videa', 'videí')}`}
        </span>
      </div>
      {scan?.errors.map((error) => (
        <p key={error} className="notice is-error">
          {error}
        </p>
      ))}
      <div className="kids-titles">
        {titles.map((title) => {
          const expanded = open === title.id
          return (
            <div key={title.id ?? 'ostatni'} className="kids-title">
              <button
                className="kids-title-head"
                onClick={() => setOpen(expanded ? undefined : title.id)}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span
                  className="kids-cover"
                  style={
                    title.coverUrl
                      ? { backgroundImage: `url("${title.coverUrl}")` }
                      : placeholderStyle(title.name)
                  }
                />
                <b>{title.name}</b>
                <span className="muted small">
                  {countOf(title.videos.length, 'video', 'videa', 'videí')}
                </span>
                {title.keywords.length > 0 && (
                  <span className="muted small">· slova: {title.keywords.join(', ')}</span>
                )}
              </button>
              {expanded && (
                <div className="kids-videos">
                  {title.videos.map((video) => (
                    <div key={video.id} className="kids-video" title={video.originalName}>
                      <span
                        className="kids-thumb"
                        style={
                          video.thumbnailUrl
                            ? { backgroundImage: `url("${video.thumbnailUrl}")` }
                            : placeholderStyle(video.name)
                        }
                      />
                      <div>
                        <b>{video.name}</b>
                        <p className="muted small">
                          {[
                            video.channel,
                            video.durationSec !== null && formatTime(video.durationSec)
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <button
                        className="icon-btn sm"
                        title="Přehrát"
                        onClick={() => void kids.playVideo(video.id)}
                      >
                        <Play size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {titles.length === 0 && <p className="muted small">Ve složce zatím nejsou žádná videa.</p>}
      </div>
    </section>
  )
}
