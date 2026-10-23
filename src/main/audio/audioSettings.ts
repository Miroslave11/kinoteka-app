import { spawn } from 'node:child_process'
import {
  mpvAudioChannels,
  parseAudioDeviceList,
  parseAudioSettings,
  type AudioDevice,
  type AudioSettings
} from '../../shared/audio'
import { languageCodes } from '../../shared/languages'
import type { MpvLaunchOptions } from '../mpv/mpvArgs'
import type { SettingsRepository } from '../settings/SettingsRepository'

const SETTINGS_KEY = 'audio'

export const loadAudioSettings = (settings: SettingsRepository): AudioSettings =>
  parseAudioSettings(settings.get(SETTINGS_KEY))

export function saveAudioSettings(settings: SettingsRepository, value: unknown): AudioSettings {
  const parsed = parseAudioSettings(value)
  settings.set(SETTINGS_KEY, parsed)
  return parsed
}

/** Nastavení zvuku → volby mpv. */
export function audioLaunchOptions(
  audio: AudioSettings
): Pick<
  MpvLaunchOptions,
  'passthroughCodecs' | 'audioDevice' | 'audioChannels' | 'audioLanguages'
> {
  return {
    passthroughCodecs: audio.passthrough,
    audioDevice: audio.device,
    audioChannels: mpvAudioChannels(audio.channels),
    audioLanguages: audio.languages.flatMap(languageCodes)
  }
}

/** Zvuková zařízení, jak je vidí mpv (WASAPI). */
export function listAudioDevices(mpvExecutable: string): Promise<AudioDevice[]> {
  return new Promise((resolve) => {
    const child = spawn(mpvExecutable, ['--no-config', '--ao=wasapi', '--audio-device=help'], {
      windowsHide: true
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
    const timer = setTimeout(() => child.kill(), 10_000)
    child.on('error', () => resolve([]))
    child.on('close', () => {
      clearTimeout(timer)
      resolve(parseAudioDeviceList(output))
    })
  })
}
