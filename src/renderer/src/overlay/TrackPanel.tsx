import { Check, FolderOpen, Globe, Minus, Plus } from 'lucide-react'
import type { AudioTrack } from '../../../shared/audio'
import { languageName } from '../../../shared/languages'
import type { SubtitleTrack } from '../../../shared/subtitles'

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** „Čeština · Dabing“ a „E-AC3 5.1 · výchozí“. */
export function describeTrack(track: AudioTrack): { name: string; detail: string } {
  const language = capitalize(languageName(track.language))
  return {
    name: track.title ? `${language} · ${track.title}` : language,
    detail: [`${track.codec} ${track.channels}`.trim(), track.default && 'výchozí']
      .filter(Boolean)
      .join(' · ')
  }
}

/** „Čeština · CZ full“ a „SRT · externí · vynucené“. */
export function describeSubtitle(track: SubtitleTrack): { name: string; detail: string } {
  const language = capitalize(languageName(track.language))
  return {
    name: track.title ? `${language} · ${track.title}` : language,
    detail: [
      track.codec,
      track.external && 'externí',
      track.forced && 'vynucené',
      track.image && 'obrázkové'
    ]
      .filter(Boolean)
      .join(' · ')
  }
}

/** „+0,5 s“ */
const formatDelay = (seconds: number): string =>
  `${seconds > 0 ? '+' : ''}${seconds.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`

function Row({
  selected,
  name,
  detail,
  onClick
}: {
  selected: boolean
  name: string
  detail?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button className={`track ${selected ? 'on' : ''}`} onClick={onClick}>
      <span className="track-check">{selected && <Check size={16} />}</span>
      <span className="track-text">
        <b>{name}</b>
        {detail && <small>{detail}</small>}
      </span>
    </button>
  )
}

/**
 * Panel stop nad ovládáním: zvuk a titulky. Ruční volba se zapamatuje pro film nebo celý
 * seriál, posun titulků pro tento soubor.
 */
export default function TrackPanel({
  audioTracks,
  subtitleTracks,
  subDelay,
  onAudio,
  onSubtitle,
  onDelay,
  onLoadSubtitle,
  onSearchOnline
}: {
  audioTracks: AudioTrack[]
  subtitleTracks: SubtitleTrack[]
  subDelay: number
  onAudio: (id: number) => void
  onSubtitle: (id: number | null) => void
  onDelay: (seconds: number) => void
  onLoadSubtitle: () => void
  onSearchOnline: () => void
}): React.JSX.Element {
  const subtitlesOn = subtitleTracks.some((t) => t.selected)
  return (
    <div className="track-panel" role="dialog" aria-label="Zvuk a titulky">
      <section>
        <h4>Zvuk</h4>
        {audioTracks.length === 0 && <p className="track-empty">Soubor nemá zvukovou stopu.</p>}
        {audioTracks.map((track) => (
          <Row
            key={track.id}
            selected={track.selected}
            {...describeTrack(track)}
            onClick={() => onAudio(track.id)}
          />
        ))}
      </section>
      <section>
        <h4>Titulky</h4>
        <Row selected={!subtitlesOn} name="Vypnuté" onClick={() => onSubtitle(null)} />
        {subtitleTracks.map((track) => (
          <Row
            key={track.id}
            selected={track.selected}
            {...describeSubtitle(track)}
            onClick={() => onSubtitle(track.id)}
          />
        ))}
        <button className="track track-load" onClick={onLoadSubtitle}>
          <span className="track-check">
            <FolderOpen size={16} />
          </span>
          <span className="track-text">
            <b>Načíst ze souboru…</b>
          </span>
        </button>
        <button className="track track-load" onClick={onSearchOnline}>
          <span className="track-check">
            <Globe size={16} />
          </span>
          <span className="track-text">
            <b>Hledat na internetu…</b>
          </span>
        </button>
        {subtitlesOn && (
          <div className="delay-row" title="Posun titulků (Z / X)">
            <span>Posun</span>
            <button className="icon-btn xs" onClick={() => onDelay(subDelay - 0.1)}>
              <Minus size={14} />
            </button>
            <b>{formatDelay(subDelay)}</b>
            <button className="icon-btn xs" onClick={() => onDelay(subDelay + 0.1)}>
              <Plus size={14} />
            </button>
            {subDelay !== 0 && (
              <button className="link-btn" onClick={() => onDelay(0)}>
                Zrušit
              </button>
            )}
          </div>
        )}
      </section>
      <p className="track-note">
        Volba stop se zapamatuje pro tento film nebo celý seriál, posun titulků pro tento soubor.
      </p>
    </div>
  )
}
