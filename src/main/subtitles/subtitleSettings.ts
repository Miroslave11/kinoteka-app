import { parseSubtitleSettings, type SubtitleSettings } from '../../shared/subtitles'
import type { SettingsRepository } from '../settings/SettingsRepository'

const SETTINGS_KEY = 'subtitles'

export const loadSubtitleSettings = (settings: SettingsRepository): SubtitleSettings =>
  parseSubtitleSettings(settings.get(SETTINGS_KEY))

export function saveSubtitleSettings(
  settings: SettingsRepository,
  value: unknown
): SubtitleSettings {
  const parsed = parseSubtitleSettings(value)
  settings.set(SETTINGS_KEY, parsed)
  return parsed
}
