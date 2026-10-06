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
  const response = await fetch(`/api/farm/${path}`, {
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
