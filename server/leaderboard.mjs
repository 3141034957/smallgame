export const MAX_SCORE = 2_000_000
import { DEFAULT_CHARACTER_ID, migrateCharacterId } from '../src/features/shop/characterRoster.mjs'
export { DEFAULT_CHARACTER_ID }

export function normalizeCharacterId(value) {
  return migrateCharacterId(value) ?? DEFAULT_CHARACTER_ID
}

export function normalizePlayerId(value) {
  if (typeof value !== 'string') return null
  const playerId = value.trim()
  return /^[a-zA-Z0-9_-]{8,96}$/.test(playerId) ? playerId : null
}

export function createLegacyPlayerId(name) {
  return `legacy:${name}`
}

export function normalizeScoreInput(value) {
  const name =
    typeof value?.name === 'string' ? value.name.trim().replace(/\s+/g, ' ').slice(0, 12) : ''
  const score = value?.score

  if (!name || !Number.isFinite(score) || score < 0) return null
  return { name, score: Math.floor(score) }
}

export function rankLeaderboardEntries(entries) {
  return [...entries]
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.updatedAt ?? 0) - (right.updatedAt ?? 0) ||
        left.name.localeCompare(right.name, 'zh-CN'),
    )
    .slice(0, 100)
    .map((entry, index) => ({
      rank: index + 1,
      characterId: normalizeCharacterId(entry.characterId),
      name: entry.name,
      score: entry.score,
    }))
}
