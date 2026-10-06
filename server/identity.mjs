import { DEFAULT_CHARACTER_ID, migrateCharacterId } from '../src/features/farm/characterRoster.mjs'
export { DEFAULT_CHARACTER_ID }

export function normalizeCharacterId(value) {
  return migrateCharacterId(value) ?? DEFAULT_CHARACTER_ID
}

export function normalizePlayerId(value) {
  if (typeof value !== 'string') return null
  const playerId = value.trim()
  return /^[a-zA-Z0-9_-]{8,96}$/.test(playerId) ? playerId : null
}
