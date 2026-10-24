import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FolderOpen, RefreshCw } from 'lucide-react'
import {
  DEFAULT_KIDS_SETTINGS,
  isValidPin,
  KIDS_THEMES,
  MAX_TIME_LIMIT_MIN,
  type KidsMode,
  type KidsSettings as Settings,
  type KidsStatus,
  type KidsTheme
} from '../../../shared/kids'

const LIMITS: [number | null, string][] = [
  [null, 'Bez limitu'],
  [30, '30 minut'],
  [60, '1 hodina'],
  [90, '1,5 hodiny'],
  [120, '2 hodiny']
]

/**
 * Nastavení → Děti: složka s pohádkami, rodičovská brána a PIN, motiv, limit a stahování
 * z YouTube. V dospělé části se ukládá bez brány (dětský režim tu není zamčený).
 */
export default function KidsSettings(): React.JSX.Element {
  const { kids } = window.kinoteka
  const [settings, setSettings] = useState<Settings>(DEFAULT_KIDS_SETTINGS)
  const [mode, setMode] = useState<KidsMode | null>(null)
  const [status, setStatus] = useState<KidsStatus | null>(null)
  const [pin, setPin] = useState('')
  const [pinAgain, setPinAgain] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [checking, setChecking] = useState(false)
  const [ytNotice, setYtNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [custom, setCustom] = useState('')

  const reload = useCallback(async () => {
    const [saved, current, info] = await Promise.all([
      kids.getSettings(),
      kids.mode(),
      kids.status()
    ])
    setSettings(saved)
    setMode(current)
    setStatus(info)
  }, [kids])

  useEffect(() => {
    void reload()
    return kids.onChanged(() => void reload())
  }, [kids, reload])

  const save = async (patch: Partial<Settings>): Promise<void> => {
    setSettings(await kids.saveSettings({ ...settings, ...patch }))
  }

  const savePin = async (value: string | null): Promise<void> => {
    if (value !== null && (!isValidPin(value) || value !== pinAgain)) {
      return setNotice({ text: 'PIN musí mít 4 až 8 číslic a oba musí být stejné.', error: true })
    }
    const ok = await kids.setPin(value)
    setPin('')
    setPinAgain('')
    setNotice(
      ok
        ? { text: value ? 'PIN je uložený.' : 'PIN je zrušený – brána se bude ptát příkladem.' }
        : { text: 'Nepovedlo se.', error: true }
    )
    await reload()
  }

  const customLimit = Number(custom)
  const presetLimit = LIMITS.some(([minutes]) => minutes === settings.timeLimitMin)

  return (
    <div className="s-stack">
      <section className="card">
        <h2>Složka s pohádkami</h2>
        <p className="muted small">
          Každá podsložka je jeden titul (třeba „Prasátko Peppa“). Videa vložená přímo do složky se
          zařadí sama.
        </p>
        <div className="key-row">
          <span className="field grow">{status?.folder ?? '…'}</span>
          <button
            className="btn sm"
            onClick={() =>
              void kids.pickFolder().then(async (folder) => {
                if (folder) setStatus(await kids.status())
              })
            }
          >
            <FolderOpen size={16} /> Změnit…
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Rodičovská brána</h2>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.parentGate}
            onChange={() => void save({ parentGate: !settings.parentGate })}
          />
          <span>Chránit část Pro rodiče a odchod z dětského režimu PINem</span>
        </label>
        <p className="muted small">
          Vypnuto = Pro rodiče, stahování i odchod fungují bez PINu (dokud dítě neovládá počítač).
        </p>
        {settings.parentGate && (
          <>
            <div className="form-grid kids-pin">
              <span>PIN pro rodiče</span>
              <div className="key-row">
                {mode?.hasPin && (
                  <span className="key-row ok">
                    <CheckCircle2 size={18} /> Nastavený
                  </span>
                )}
                <input
                  className="field kids-num"
                  type="password"
                  inputMode="numeric"
                  aria-label="PIN"
                  placeholder={mode?.hasPin ? 'Nový PIN' : 'PIN (4–8 číslic)'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
                <input
                  className="field kids-num"
                  type="password"
                  inputMode="numeric"
                  aria-label="PIN znovu"
                  placeholder="Znovu"
                  value={pinAgain}
                  onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
              </div>
            </div>
            <div className="actions">
              <button className="btn sm primary" disabled={!pin} onClick={() => void savePin(pin)}>
                Uložit PIN
              </button>
              {mode?.hasPin && (
                <button className="btn sm" onClick={() => void savePin(null)}>
                  Zrušit PIN
                </button>
              )}
              <span className="muted small">Bez PINu se brána ptá příkladem pro dospělé.</span>
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.protectExit}
                onChange={() => void save({ protectExit: !settings.protectExit })}
              />
              <span>Odchod z dětského režimu jen za branou</span>
            </label>
            <p className="muted small">
              Vypnuto = tlačítko Odejít vedle Pro rodiče vrátí Kinotéku do dospělé části bez PINu.
            </p>
          </>
        )}
        {notice && <p className={`notice ${notice.error ? 'is-error' : ''}`}>{notice.text}</p>}
      </section>

      <section className="card">
        <h2>Pohádky</h2>
        <div className="form-grid">
          <label htmlFor="kids-theme">Motiv</label>
          <select
            id="kids-theme"
            className="field"
            value={settings.theme}
            onChange={(e) => void save({ theme: e.target.value as KidsTheme })}
          >
            {KIDS_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>

          <label htmlFor="kids-limit">Denní časový limit</label>
          <div className="key-row">
            <select
              id="kids-limit"
              className="field"
              value={settings.timeLimitMin ?? ''}
              onChange={(e) =>
                void save({ timeLimitMin: e.target.value ? Number(e.target.value) : null })
              }
            >
              {LIMITS.map(([minutes, label]) => (
                <option key={label} value={minutes ?? ''}>
                  {label}
                </option>
              ))}
              {!presetLimit && settings.timeLimitMin !== null && (
                <option value={settings.timeLimitMin}>{settings.timeLimitMin} minut</option>
              )}
            </select>
            <input
              className="field kids-num"
              inputMode="numeric"
              aria-label="Jiný limit v minutách"
              placeholder="jiný"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
            <button
              className="btn sm"
              disabled={!(customLimit > 0 && customLimit <= MAX_TIME_LIMIT_MIN)}
              onClick={() => void save({ timeLimitMin: customLimit }).then(() => setCustom(''))}
            >
              min
            </button>
          </div>
        </div>
        {mode && mode.timeLeftSec !== null && (
          <div className="actions kids-left">
            <span className="muted small">
              Dnes zbývá {Math.ceil(mode.timeLeftSec / 60)} min pohádek.
            </span>
            <button className="btn sm" onClick={() => void kids.resetPlayTime().then(reload)}>
              Vynulovat dnešní čas
            </button>
          </div>
        )}
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.autoplayNext}
            onChange={() => void save({ autoplayNext: !settings.autoplayNext })}
          />
          <span>Po konci pohádky automaticky další ze stejného titulu</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.startInKids}
            onChange={() => void save({ startInKids: !settings.startInKids })}
          />
          <span>Spouštět Kinotéku rovnou v dětském režimu</span>
        </label>
      </section>

      <section className="card">
        <h2>Stahování z YouTube</h2>
        <p className="muted small">
          Nástroj yt-dlp se stáhne při prvním stahování a jednou denně se aktualizuje.
        </p>
        <div className="actions">
          <span>
            {status?.ytDlpVersion ? `yt-dlp ${status.ytDlpVersion}` : 'yt-dlp zatím nestažený'}
          </span>
          <button
            className="btn sm"
            disabled={checking}
            onClick={() => {
              setChecking(true)
              void kids.checkYtDlp().then(async (result) => {
                setChecking(false)
                setYtNotice(
                  result.ok
                    ? { text: `yt-dlp ${result.version} je aktuální.` }
                    : { text: result.message, error: true }
                )
                setStatus(await kids.status())
              })
            }}
          >
            <RefreshCw size={16} className={checking ? 'spin' : ''} /> Zkontrolovat aktualizace
          </button>
        </div>
        {ytNotice && (
          <p className={`notice ${ytNotice.error ? 'is-error' : ''}`}>{ytNotice.text}</p>
        )}
      </section>
    </div>
  )
}
