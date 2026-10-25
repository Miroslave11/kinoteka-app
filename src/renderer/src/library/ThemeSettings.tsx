import { useEffect, useState } from 'react'
import type { ThemeSettings as Settings, ThemeStatus } from '../../../shared/theme'
import { countOf } from '../../../shared/plural'

/** Nastavení → Zvuk: ústřední melodie na stránce filmu a seriálu. */
export default function ThemeSettings(): React.JSX.Element {
  const { theme } = window.kinoteka
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<ThemeStatus | null>(null)

  useEffect(() => {
    void theme.getSettings().then(setSettings)
    void theme.status().then(setStatus)
    return theme.onStatusChanged(setStatus)
  }, [theme])

  if (!settings) return <section className="card" />

  const save = (patch: Partial<Settings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void theme.saveSettings(next).then(setSettings)
  }

  return (
    <section className="card">
      <h2>Ústřední melodie</h2>
      <p className="muted small">
        Na stránce filmu nebo seriálu potichu zahraje jeho ústřední melodii. Melodii titulu změníš v
        detailu odkazem „Melodie…“, nebo ji ulož vedle filmu jako{' '}
        <code>Název souboru filmu.theme.mp3</code> (u seriálu <code>theme.mp3</code> ve složce
        seriálu).
      </p>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={() => save({ enabled: !settings.enabled })}
        />
        <span>Přehrávat ústřední melodii</span>
      </label>
      <div className="form-grid">
        <label htmlFor="theme-volume">Hlasitost</label>
        <div className="theme-volume">
          <input
            id="theme-volume"
            type="range"
            min={5}
            max={100}
            step={5}
            value={settings.volume}
            disabled={!settings.enabled}
            onChange={(event) => save({ volume: Number(event.target.value) })}
          />
          <span className="muted small">{settings.volume} %</span>
        </div>
      </div>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.autoDownload}
          onChange={() => save({ autoDownload: !settings.autoDownload })}
        />
        <span>Stahovat melodie automaticky</span>
      </label>
      <p className="muted small">
        Odkaz na melodii se hledá v komunitní databázi ThemerrDB podle údajů z TMDB a z YouTube se
        stáhne jen zvuk ze začátku (asi 1 MB na titul). Běží na pozadí, jeden titul po druhém.
        Stahováním z YouTube souhlasíš s jeho podmínkami – jen pro vlastní potřebu.
      </p>
      {status && settings.autoDownload && (
        <p className="muted small">
          {status.running || status.pending > 0
            ? `Stahuje se… zbývá ${countOf(status.pending, 'titul', 'tituly', 'titulů')}. `
            : ''}
          Staženo: {countOf(status.downloaded, 'melodie', 'melodie', 'melodií')}
          {status.missing > 0 &&
            ` · ${countOf(status.missing, 'titul', 'tituly', 'titulů')} bez melodie v databázi`}
        </p>
      )}
    </section>
  )
}
