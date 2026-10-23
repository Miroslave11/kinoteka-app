import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import {
  PASSTHROUGH_FORMATS,
  PCM_CHANNELS,
  type AudioDevice,
  type AudioSettings,
  type PassthroughFormat,
  type PcmChannels
} from '../../../shared/audio'
import { languageName } from '../../../shared/languages'

/** Jazyky v nabídce „Přidat jazyk“. */
const LANGUAGE_CHOICES = ['cs', 'sk', 'en', 'de', 'fr', 'es', 'it', 'pl', 'hu', 'ru', 'ja', 'ko']

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Nastavení → Zvuk: výstup, passthrough do receiveru a preferované jazyky. */
export default function SoundSettings(): React.JSX.Element {
  const { audio } = window.kinoteka
  const [settings, setSettings] = useState<AudioSettings | null>(null)
  const [devices, setDevices] = useState<AudioDevice[] | null>(null)

  useEffect(() => {
    void audio.getSettings().then(setSettings)
    void audio.listDevices().then(setDevices)
  }, [audio])

  if (!settings) return <p className="muted">Načítám…</p>

  const save = (patch: Partial<AudioSettings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void audio.saveSettings(next).then(setSettings)
  }
  const togglePassthrough = (id: PassthroughFormat): void =>
    save({
      passthrough: settings.passthrough.includes(id)
        ? settings.passthrough.filter((f) => f !== id)
        : [...settings.passthrough, id]
    })
  const moveLanguage = (index: number, by: number): void => {
    const languages = [...settings.languages]
    const [moved] = languages.splice(index, 1)
    languages.splice(index + by, 0, moved!)
    save({ languages })
  }
  const knownDevice = devices?.some((d) => d.name === settings.device) ?? true

  return (
    <div className="s-stack">
      <p className="muted small">Změny platí od dalšího spuštění přehrávání.</p>

      <section className="card">
        <h2>Výstup zvuku</h2>
        <div className="form-grid">
          <label htmlFor="audio-device">Zařízení</label>
          <select
            id="audio-device"
            className="field"
            value={settings.device}
            onChange={(event) => save({ device: event.target.value })}
          >
            {(devices ?? [{ name: 'auto', description: '' }]).map((device) => (
              <option key={device.name} value={device.name}>
                {device.name === 'auto' ? 'Výchozí zařízení Windows' : device.description}
              </option>
            ))}
            {!knownDevice && (
              <option value={settings.device}>
                Zařízení teď není připojené ({settings.device})
              </option>
            )}
          </select>
          <label htmlFor="audio-channels">Kanály při dekódování</label>
          <select
            id="audio-channels"
            className="field"
            value={settings.channels}
            onChange={(event) => save({ channels: event.target.value as PcmChannels })}
          >
            {PCM_CHANNELS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {devices === null && <p className="muted small">Zjišťuji zvuková zařízení…</p>}
      </section>

      <section className="card">
        <h2>Passthrough do receiveru</h2>
        <p className="muted small">
          Zaškrtnuté formáty jdou přes HDMI nedekódované a receiver ukáže Dolby nebo DTS. Ostatní
          dekóduje počítač a posílá je jako vícekanálové PCM (hlasitost pak ovládá aplikace).
          Formát, který receiver nebo televize neumí, odškrtni.
        </p>
        {PASSTHROUGH_FORMATS.map((format) => (
          <label key={format.id} className="toggle-row">
            <input
              type="checkbox"
              checked={settings.passthrough.includes(format.id)}
              onChange={() => togglePassthrough(format.id)}
            />
            <span>{format.label}</span>
          </label>
        ))}
        <div className="actions">
          <button
            className="btn sm"
            onClick={() => save({ passthrough: PASSTHROUGH_FORMATS.map((f) => f.id) })}
          >
            Vše přes receiver
          </button>
          <button className="btn sm" onClick={() => save({ passthrough: [] })}>
            Vždy dekódovat (PCM)
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Preferované jazyky zvuku</h2>
        <p className="muted small">
          Přehrávač vybere první jazyk ze seznamu, který soubor má. Když stopu v přehrávači přepneš
          ručně, zapamatuje se pro daný film nebo celý seriál.
        </p>
        <ol className="lang-list">
          {settings.languages.map((code, index) => (
            <li key={code}>
              <span>{capitalize(languageName(code))}</span>
              <button
                className="icon-btn xs"
                title="Výš"
                disabled={index === 0}
                onClick={() => moveLanguage(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-btn xs"
                title="Níž"
                disabled={index === settings.languages.length - 1}
                onClick={() => moveLanguage(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="icon-btn xs"
                title="Odebrat"
                onClick={() => save({ languages: settings.languages.filter((c) => c !== code) })}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
        <select
          className="field"
          value=""
          aria-label="Přidat jazyk"
          onChange={(event) =>
            event.target.value && save({ languages: [...settings.languages, event.target.value] })
          }
        >
          <option value="">Přidat jazyk…</option>
          {LANGUAGE_CHOICES.filter((code) => !settings.languages.includes(code)).map((code) => (
            <option key={code} value={code}>
              {capitalize(languageName(code))}
            </option>
          ))}
        </select>
      </section>
    </div>
  )
}
