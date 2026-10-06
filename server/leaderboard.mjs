export const MAX_SCORE = 2_000_000
export const DEFAULT_CHARACTER_ID = 'burger-dog'

const CHARACTER_IDS = new Set([
  'default',
  'steampunk',
  'penguin',
  'neon',
  'golden',
  'shadow',
  'burger-dog',
])

export function normalizeCharacterId(value) {
  return typeof value === 'string' && CHARACTER_IDS.has(value) ? value : DEFAULT_CHARACTER_ID
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
