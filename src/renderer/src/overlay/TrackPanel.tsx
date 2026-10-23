import { Check } from 'lucide-react'
import type { AudioTrack } from '../../../shared/audio'
import { languageName } from '../../../shared/languages'

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

/** Panel zvukových stop nad ovládáním; volba se zapamatuje pro film nebo celý seriál. */
export default function TrackPanel({
  tracks,
  onSelect
}: {
  tracks: AudioTrack[]
  onSelect: (id: number) => void
}): React.JSX.Element {
  return (
    <div className="track-panel" role="dialog" aria-label="Zvukové stopy">
      <h4>Zvuk</h4>
      {tracks.length === 0 && <p className="track-empty">Soubor nemá zvukovou stopu.</p>}
      {tracks.map((track) => {
        const { name, detail } = describeTrack(track)
        return (
          <button
            key={track.id}
            className={`track ${track.selected ? 'on' : ''}`}
            onClick={() => onSelect(track.id)}
          >
            <span className="track-check">{track.selected && <Check size={16} />}</span>
            <span className="track-text">
              <b>{name}</b>
              <small>{detail}</small>
            </span>
          </button>
        )
      })}
      <p className="track-note">Volba se zapamatuje pro tento film nebo celý seriál.</p>
    </div>
  )
}
