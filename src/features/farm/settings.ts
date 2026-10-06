export type FarmSettings = { effects: boolean }
export const FARM_SETTINGS_KEY = 'farm-settings-v1'

// Visual effects are the first thing to drop on a slow phone. Gameplay rules
// never depend on this flag.
export function loadFarmSettings(): FarmSettings {
  let stored: unknown = null
  try {
    stored = JSON.parse(localStorage.getItem(FARM_SETTINGS_KEY) ?? 'null')
  } catch {
    stored = null
  }
  const effects = (stored as { effects?: unknown } | null)?.effects
  return { effects: effects !== false }
}

export function saveFarmSettings(next: FarmSettings): FarmSettings {
  const settings = { effects: next.effects !== false }
  try {
    localStorage.setItem(FARM_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* Storage optional. */
  }
  return settings
}
