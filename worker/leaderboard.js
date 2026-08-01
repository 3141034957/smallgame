export const MAX_SCORE = 500_000

export function normalizeScoreInput(value) {
  const name = typeof value?.name === 'string'
    ? value.name.trim().replace(/\s+/g, ' ').slice(0, 12)
    : ''
  const score = value?.score

  if (!name || !Number.isFinite(score) || score < 0) return null
  return { name, score: Math.floor(score) }
}

export function rankLeaderboardEntries(entries) {
  return [...entries]
    .sort((left, right) =>
      right.score - left.score ||
      (left.updatedAt ?? 0) - (right.updatedAt ?? 0) ||
      left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, 100)
    .map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      score: entry.score,
    }))
}
