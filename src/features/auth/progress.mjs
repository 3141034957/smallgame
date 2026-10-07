export const PROGRESS_LIMIT = 256 * 1024
export const PROGRESS_KEYS = [
  'farm-character-profile-v1',
  'farm-career-v1',
  'farm-quests-v1',
  'farm-achievements-v1',
  'farm-settings-v1',
  'farm-seen-help-v1',
  'clockwork-player-nickname-v1',
  'clockwork-player-profile-v1',
  'character-unlocks-v1',
  'character-selected-v1',
]
export function isProgressKey(key) {
  return PROGRESS_KEYS.includes(key) || /^farm-best-v[\w-]+:\d{4}-\d{2}-\d{2}$/.test(key)
}
export function validProgress(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const entries = Object.entries(data)
  return (
    entries.length <= 1024 &&
    entries.every(
      ([key, value]) => isProgressKey(key) && typeof value === 'string' && value.length <= 65536,
    ) &&
    new TextEncoder().encode(JSON.stringify(data)).length <= PROGRESS_LIMIT
  )
}
