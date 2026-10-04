import { ISLANDS } from './rules.mjs'
export type IslandProgress = Record<string, { score: number; stars: number }>
const KEY = 'mochi-island-progress-v1'
export function loadIslandProgress(): IslandProgress {
  const progress: IslandProgress = {}
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    for (const island of ISLANDS) {
      const record = value?.[island.id]
      if (Number.isInteger(record?.score) && record.score >= 0 && record.score <= 20000 && Number.isInteger(record.stars) && record.stars >= 0 && record.stars <= 3) progress[island.id] = record
    }
  } catch { /* Keep exploration available without browser storage. */ }
  return progress
}
export function saveIslandProgress(progress: IslandProgress): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); return true } catch { return false }
}
