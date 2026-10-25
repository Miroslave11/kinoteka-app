import { useEffect, useState } from 'react'
import type { ThemeSettings as Settings } from '../../../shared/theme'

/** Nastavení → Zvuk: ústřední melodie na stránce filmu a seriálu. */
export default function ThemeSettings(): React.JSX.Element {
  const { theme } = window.kinoteka
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void theme.getSettings().then(setSettings)
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
        Na stránce filmu nebo seriálu potichu zahraje jeho ústřední melodii. Melodii titulu vybereš
        v detailu odkazem „Melodie…“, nebo ji ulož vedle filmu jako{' '}
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
    </section>
  )
}
