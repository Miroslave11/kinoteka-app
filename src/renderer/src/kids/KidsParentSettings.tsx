import { useEffect, useState } from 'react'
import { Check, FolderOpen, RefreshCw } from 'lucide-react'
import {
  isValidPin,
  KIDS_THEMES,
  MAX_TIME_LIMIT_MIN,
  type KidsSettings,
  type KidsStatus
} from '../../../shared/kids'
import { useKids } from './KidsData'

const LIMITS: [number | null, string][] = [
  [null, 'Vypnuto'],
  [30, '30 min'],
  [60, '1 h'],
  [90, '1,5 h']
]

/** Nastavení dětské části (za rodičovskou branou). */
export default function KidsParentSettings(): React.JSX.Element {
  const { kids } = window.kinoteka
  const { settings, mode, reload } = useKids()
  const [status, setStatus] = useState<KidsStatus | null>(null)
  const [pin, setPin] = useState('')
  const [pinAgain, setPinAgain] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [custom, setCustom] = useState('')

  useEffect(() => void kids.status().then(setStatus), [kids])

  const save = async (patch: Partial<KidsSettings>): Promise<void> => {
    await kids.saveSettings({ ...settings, ...patch })
    await reload()
  }

  const savePin = async (value: string | null): Promise<void> => {
    if (value !== null && (!isValidPin(value) || value !== pinAgain)) {
      return setNotice('PIN musí mít 4 až 8 číslic a oba musí být stejné.')
    }
    const ok = await kids.setPin(value)
    setPin('')
    setPinAgain('')
    setNotice(
      ok
        ? value
          ? 'PIN je uložený.'
          : 'PIN je zrušený – brána se bude ptát příkladem.'
        : 'Nepovedlo se.'
    )
    await reload()
  }

  const customLimit = Number(custom)
  const presetLimit = LIMITS.some(([minutes]) => minutes === settings.timeLimitMin)

  return (
    <div className="k-panel k-settings">
      <div className="k-setrow">
        <label>Složka s pohádkami</label>
        <div className="k-row">
          <span className="k-field">{status?.folder ?? '…'}</span>
          <button
            className="k-btn"
            onClick={() =>
              void kids.pickFolder().then(async (folder) => {
                if (folder) setStatus(await kids.status())
              })
            }
          >
            <FolderOpen size={18} /> Změnit…
          </button>
        </div>
      </div>

      <div className="k-setrow">
        <label>
          PIN pro rodiče<small>Bez PINu se brána ptá příkladem pro dospělé</small>
        </label>
        <div className="k-row">
          {mode.hasPin && (
            <span className="k-ok">
              <Check size={18} /> Nastavený
            </span>
          )}
          <input
            className="k-field small"
            type="password"
            inputMode="numeric"
            placeholder={mode.hasPin ? 'Nový PIN' : 'PIN (4–8 číslic)'}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          />
          <input
            className="k-field small"
            type="password"
            inputMode="numeric"
            placeholder="Znovu"
            value={pinAgain}
            onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, '').slice(0, 8))}
          />
          <button className="k-btn" disabled={!pin} onClick={() => void savePin(pin)}>
            Uložit PIN
          </button>
          {mode.hasPin && (
            <button className="k-btn" onClick={() => void savePin(null)}>
              Zrušit PIN
            </button>
          )}
        </div>
      </div>
      {notice && <p className="k-notice">{notice}</p>}

      <div className="k-setrow">
        <label>Motiv</label>
        <div className="k-themes">
          {KIDS_THEMES.map((theme) => (
            <button
              key={theme.id}
              className={settings.theme === theme.id ? 'on' : ''}
              onClick={() => void save({ theme: theme.id })}
            >
              <i className="k-app" data-theme={theme.id} />
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className="k-setrow">
        <label>
          Další pohádka automaticky<small>ze stejného titulu</small>
        </label>
        <button
          className={`k-toggle ${settings.autoplayNext ? '' : 'off'}`}
          aria-pressed={settings.autoplayNext}
          onClick={() => void save({ autoplayNext: !settings.autoplayNext })}
        />
      </div>

      <div className="k-setrow">
        <label>
          Časový limit<small>kolik minut pohádek denně; potom přehrávání skončí</small>
        </label>
        <div className="k-row">
          <span className="k-seg">
            {LIMITS.map(([minutes, label]) => (
              <button
                key={label}
                className={settings.timeLimitMin === minutes ? 'on' : ''}
                onClick={() => void save({ timeLimitMin: minutes })}
              >
                {label}
              </button>
            ))}
          </span>
          <input
            className="k-field tiny"
            inputMode="numeric"
            placeholder={presetLimit ? 'jiný' : String(settings.timeLimitMin)}
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
          <button
            className="k-btn"
            disabled={!(customLimit > 0 && customLimit <= MAX_TIME_LIMIT_MIN)}
            onClick={() => void save({ timeLimitMin: customLimit }).then(() => setCustom(''))}
          >
            min
          </button>
          {mode.timeLeftSec !== null && (
            <>
              <span className="k-muted">dnes zbývá {Math.ceil(mode.timeLeftSec / 60)} min</span>
              <button className="k-btn" onClick={() => void kids.resetPlayTime().then(reload)}>
                Vynulovat dnešní čas
              </button>
            </>
          )}
        </div>
      </div>

      <div className="k-setrow">
        <label>Spouštět Kinotéku rovnou v dětském režimu</label>
        <button
          className={`k-toggle ${settings.startInKids ? '' : 'off'}`}
          aria-pressed={settings.startInKids}
          onClick={() => void save({ startInKids: !settings.startInKids })}
        />
      </div>

      <div className="k-setrow">
        <label>
          Stahování z YouTube<small>yt-dlp se stáhne při prvním stahování</small>
        </label>
        <div className="k-row">
          <span className="k-ok">
            {status?.ytDlpVersion ? `yt-dlp ${status.ytDlpVersion}` : 'yt-dlp zatím nestažený'}
          </span>
          <button
            className="k-btn"
            disabled={checking}
            onClick={() => {
              setChecking(true)
              void kids.checkYtDlp().then(async (result) => {
                setChecking(false)
                setNotice(result.ok ? `yt-dlp ${result.version} je aktuální.` : result.message)
                setStatus(await kids.status())
              })
            }}
          >
            <RefreshCw size={18} className={checking ? 'k-spin' : ''} /> Zkontrolovat aktualizace
          </button>
        </div>
      </div>
    </div>
  )
}
