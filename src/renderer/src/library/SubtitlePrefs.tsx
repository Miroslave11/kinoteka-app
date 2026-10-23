import { useEffect, useState } from 'react'
import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_MODES,
  type SubtitleMode,
  type SubtitleSettings,
  type SubtitleStyle
} from '../../../shared/subtitles'
import LanguageList from './LanguageList'
import OnlineSubtitlesSettings from './OnlineSubtitlesSettings'

/** Výška náhledu v bodech; mpv počítá velikost písma pro výšku obrazu 720 bodů. */
const PREVIEW_HEIGHT = 270
const SCALE = PREVIEW_HEIGHT / 720

/** Náhled titulků přes obrázek – přibližně tak, jak je vykreslí mpv. */
function Preview({ style }: { style: SubtitleStyle }): React.JSX.Element {
  const outline = style.outline * SCALE * 1.6
  const shadow = style.background
    ? 'none'
    : [-1, 0, 1]
        .flatMap((x) =>
          [-1, 0, 1].map((y) => `${x * outline}px ${y * outline}px 0 ${style.outlineColor}`)
        )
        .join(', ')
  return (
    <div className="sub-preview" style={{ height: PREVIEW_HEIGHT }}>
      <span
        className="sub-preview-text"
        style={{
          top: `${style.position}%`,
          fontSize: style.size * SCALE * 1.15,
          fontWeight: style.bold ? 700 : 400,
          color: style.color,
          textShadow: shadow,
          background: style.background ? 'rgb(0 0 0 / 0.69)' : 'transparent'
        }}
      >
        Příliš žluťoučký kůň úpěl ďábelské ódy.
        <br />
        Takhle budou vypadat titulky.
      </span>
    </div>
  )
}

/** Nastavení → Titulky: kdy titulky zapnout, jazyky a vzhled. */
export default function SubtitlePrefs(): React.JSX.Element {
  const { subtitles } = window.kinoteka
  const [settings, setSettings] = useState<SubtitleSettings | null>(null)

  useEffect(() => {
    void subtitles.getSettings().then(setSettings)
  }, [subtitles])

  if (!settings) return <p className="muted">Načítám…</p>

  const save = (patch: Partial<SubtitleSettings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void subtitles.saveSettings(next).then(setSettings)
  }
  const style = settings.style
  const setStyle = (patch: Partial<SubtitleStyle>): void => save({ style: { ...style, ...patch } })

  return (
    <div className="s-stack">
      <p className="muted small">Změny platí od dalšího spuštění přehrávání.</p>

      <section className="card">
        <h2>Kdy titulky zapnout</h2>
        <div className="form-grid">
          <label htmlFor="sub-mode">Automaticky</label>
          <select
            id="sub-mode"
            className="field"
            value={settings.mode}
            onChange={(event) => save({ mode: event.target.value as SubtitleMode })}
          >
            {SUBTITLE_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
        <p className="muted small">
          „Vynucené“ titulky překládají jen cizojazyčné pasáže filmu s dabingem. Titulky vedle filmu
          (stejný název, přípona .srt, .ass, .sub…) se načtou samy a jejich kódování (Windows-1250,
          UTF-8) se pozná automaticky. Volba v přehrávači se zapamatuje pro film nebo seriál.
        </p>
      </section>

      <section className="card">
        <h2>Preferované jazyky titulků</h2>
        <LanguageList
          languages={settings.languages}
          onChange={(languages) => save({ languages })}
        />
      </section>

      <OnlineSubtitlesSettings />

      <section className="card">
        <h2>Vzhled titulků</h2>
        <Preview style={style} />
        <div className="form-grid sub-style">
          <label htmlFor="sub-size">Velikost</label>
          <input
            id="sub-size"
            type="range"
            min={20}
            max={90}
            value={style.size}
            onChange={(event) => setStyle({ size: Number(event.target.value) })}
          />
          <label htmlFor="sub-position">Výška od spodu</label>
          <input
            id="sub-position"
            type="range"
            min={50}
            max={100}
            value={style.position}
            style={{ direction: 'rtl' }}
            onChange={(event) => setStyle({ position: Number(event.target.value) })}
          />
          <label htmlFor="sub-color">Barva písma</label>
          <input
            id="sub-color"
            type="color"
            value={style.color}
            onChange={(event) => setStyle({ color: event.target.value })}
          />
          <label htmlFor="sub-outline-color">Barva obrysu</label>
          <input
            id="sub-outline-color"
            type="color"
            value={style.outlineColor}
            disabled={style.background}
            onChange={(event) => setStyle({ outlineColor: event.target.value })}
          />
          <label htmlFor="sub-outline">Obrys</label>
          <input
            id="sub-outline"
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={style.outline}
            disabled={style.background}
            onChange={(event) => setStyle({ outline: Number(event.target.value) })}
          />
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={style.background}
            onChange={() => setStyle({ background: !style.background })}
          />
          <span>Tmavý pruh pod textem místo obrysu</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={style.bold}
            onChange={() => setStyle({ bold: !style.bold })}
          />
          <span>Tučné písmo</span>
        </label>
        <div className="actions">
          <button className="btn sm" onClick={() => save({ style: DEFAULT_SUBTITLE_STYLE })}>
            Obnovit výchozí vzhled
          </button>
        </div>
        <p className="muted small">
          Vzhled platí pro textové titulky (SRT, VTT, SUB). Titulky ASS mají vlastní styl a
          obrázkové (PGS, VobSub) se nedají změnit.
        </p>
      </section>
    </div>
  )
}
