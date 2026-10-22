import { accountStorage } from '@/utils/accountStorage'
export type FarmSettings = { effects: boolean; muted: boolean }
export const FARM_SETTINGS_KEY = 'farm-settings-v1'

// Visual effects are the first thing to drop on a slow phone. Gameplay rules
// never depend on this flag.
export function loadFarmSettings(): FarmSettings {
  let stored: unknown = null
  try {
    stored = JSON.parse(accountStorage.getItem(FARM_SETTINGS_KEY) ?? 'null')
  } catch {
    stored = null
  }
  const value = stored as { effects?: unknown; muted?: unknown } | null
  return { effects: value?.effects !== false, muted: value?.muted === true }
}

export function saveFarmSettings(next: Partial<FarmSettings>): FarmSettings {
  // Each switch changes one preference without resetting the other.
  const previous = loadFarmSettings()
  const settings = {
    effects: next.effects === undefined ? previous.effects : next.effects !== false,
    muted: next.muted === undefined ? previous.muted : next.muted === true,
  }
  try {
    accountStorage.setItem(FARM_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* Storage optional. */
  }
  return settings
}
