import { audioTracksFromMpv, chooseAudioTrack, type TrackPreference } from '../../shared/audio'
import {
  chooseSubtitleTrack,
  subtitleTracksFromMpv,
  type SubtitleSettings
} from '../../shared/subtitles'
import type { ExternalSubtitle } from '../subtitles/externalSubtitles'

/** Co je potřeba k výběru stop jednoho souboru. */
export interface TrackChoices {
  audio: { remembered: TrackPreference | null; languages: string[] }
  subtitles: { remembered: TrackPreference | null } & Pick<SubtitleSettings, 'mode' | 'languages'>
  /** Uložený posun titulků pro soubor (s). */
  subDelay: number
  /** Externí titulky k souboru, připravené pro mpv. */
  externalSubtitles: () => Promise<ExternalSubtitle[]>
}

interface MpvCommands {
  command(...args: unknown[]): Promise<unknown>
}

/**
 * Po načtení každého souboru přidá externí titulky a vybere zvuk a titulky
 * (zapamatovaná volba → preferované jazyky). Proběhne jednou na soubor; když se mezitím
 * načte další soubor, rozpracovaný výběr se zahodí.
 */
export class TrackSelector {
  private generation = 0
  private handled = -1
  private choices: TrackChoices | null = null

  constructor(private readonly mpv: MpvCommands) {}

  /** Nový soubor – další `onFileLoaded()` vybere stopy podle těchto voleb. */
  reset(choices: TrackChoices): void {
    this.generation++
    this.choices = choices
  }

  async onFileLoaded(): Promise<void> {
    const generation = this.generation
    const choices = this.choices
    if (!choices || this.handled === generation) return
    this.handled = generation
    const current = (): boolean => generation === this.generation
    const run = (...args: unknown[]): Promise<unknown> =>
      this.mpv.command(...args).catch(() => undefined)

    const externals = await choices.externalSubtitles().catch(() => [])
    for (const subtitle of externals) {
      if (!current()) return
      const args: unknown[] = ['sub-add', subtitle.path, 'auto', subtitle.title]
      if (subtitle.language) args.push(subtitle.language)
      await run(...args)
    }
    if (!current()) return

    const list = await run('get_property', 'track-list')
    if (!current()) return
    const audio = audioTracksFromMpv(list)
    const subtitles = subtitleTracksFromMpv(list)

    const aid = chooseAudioTrack(audio, choices.audio.remembered, choices.audio.languages)
    if (aid !== null && !audio.find((t) => t.id === aid)?.selected) {
      await run('set_property', 'aid', aid)
    }
    const audioLanguage = audio.find((t) => t.id === aid)?.language ?? null
    const sid = chooseSubtitleTrack(
      subtitles,
      audioLanguage,
      choices.subtitles.remembered,
      choices.subtitles
    )
    await run('set_property', 'sid', sid ?? 'no')
    await run('set_property', 'sub-delay', choices.subDelay)
  }
}
