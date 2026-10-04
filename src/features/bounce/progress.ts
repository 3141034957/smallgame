import type { BounceRound } from './rules.mjs'
const KEY = 'mochi-bounce-best-v1'
export type Best = { score: number; maxCombo: number }
export function loadBest(day: string, mode = 'classic'): Best {
  try {
    const value = JSON.parse(localStorage.getItem(mode === 'tour' ? `${KEY}-tour` : KEY) ?? '{}')[day]
    if (value && Number.isInteger(value.score) && value.score >= 0 && Number.isInteger(value.maxCombo) && value.maxCombo >= 0) return value
  } catch { /* Playing still works without storage. */ }
  return { score: 0, maxCombo: 0 }
}
export function saveBest(round: BounceRound, mode = 'classic'): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(mode === 'tour' ? `${KEY}-tour` : KEY) ?? '{}')
    const old = loadBest(round.day, mode)
    saved[round.day] = { score: Math.max(old.score, round.score), maxCombo: Math.max(old.maxCombo, round.maxCombo) }
    const recent = Object.fromEntries(Object.entries(saved).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30))
    localStorage.setItem(mode === 'tour' ? `${KEY}-tour` : KEY, JSON.stringify(recent))
    return true
  } catch { return false }
}
