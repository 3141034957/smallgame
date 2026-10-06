export type LeaderboardEntry = { rank: number; characterId: string; name: string; score: number }

const API_BASE = '/api'
export async function submitScore(
  playerId: string,
  name: string,
  score: number,
  characterId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name, score, characterId }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
        : AbortSignal.timeout(6000),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function fetchLeaderboard(signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`, {
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
        : AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json.data) ? json.data : []
  } catch {
    return []
  }
}
