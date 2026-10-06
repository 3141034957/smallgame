import type { Difficulty, Lane } from './engine'

export type Player = { id: string; name: string }
export type Tap = { lane: Lane; time: number }
export type ScoreEntry = {
  rank: number
  name: string
  score: number
  accuracy: number
  maxCombo: number
  stars: number
  seconds: number
  characterId?: string
  isYou: boolean
}
export type Board = { data: ScoreEntry[]; own: ScoreEntry | null; total: number }
export type Submission = { songId: string; difficulty: Difficulty; score: number; taps: Tap[] }
const PLAYER_KEY = 'mochi-melody-player-v1'

export function loadPlayer(): Player {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? 'null')
    if (stored && /^[a-zA-Z0-9_-]{8,96}$/.test(stored.id) && typeof stored.name === 'string')
      return { id: stored.id, name: stored.name.slice(0, 12) }
  } catch {
    /* A temporary identity also works when browser storage is disabled. */
  }
  const random = new Uint32Array(2)
  crypto.getRandomValues(random)
  const player = {
    id: `melody_${Date.now().toString(36)}_${random[0].toString(36)}${random[1].toString(36)}`,
    name: '',
  }
  savePlayer(player)
  return player
}

export function savePlayer(player: Player) {
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player))
  } catch {
    /* Preserve identity in memory for this visit. */
  }
}

export async function melodyRequest<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
  namespace = 'melody',
): Promise<T> {
  const response = await fetch(`/api/${namespace}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
      : AbortSignal.timeout(6000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(result?.error ?? '排行榜暂时连不上，本机成绩仍然保留，请稍后再试。')
  if (!result || !Array.isArray(result.data))
    throw new Error('排行榜暂时连不上，本机成绩仍然保留，请稍后再试。')
  return result as T
}
