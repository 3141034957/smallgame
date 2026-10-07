import { activeAccountId } from '@/utils/accountStorage'
import { notifyAccountExpired } from '@/features/auth/client'
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
export async function farmRequest<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  // A score carries every frame of the run, so the upload itself needs more
  // time than a leaderboard read: on mobile the body can take seconds.
  const timeout = body ? 15_000 : 6_000
  const response = await fetch(`/api/farm/${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: {
      ...(body ? { 'Content-Type': 'application/json', 'X-Echo-Request': '1' } : {}),
      ...(activeAccountId() ? { 'X-Echo-User': activeAccountId()! } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout),
  })
  const result = await response.json().catch(() => null)
  if (response.status === 401) notifyAccountExpired()
  if (!response.ok) throw new Error(result?.error ?? '排行榜连不上，稍后再试')
  if (!result || !Array.isArray(result.data)) throw new Error('排行榜连不上，稍后再试')
  return result as T
}
