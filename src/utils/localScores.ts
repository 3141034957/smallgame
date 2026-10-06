import { accountStorage } from '@/utils/accountStorage'
// Scores are optional local progress. Invalid or unavailable saves must not
// break the game or turn a corrupt "Infinity" into an unbeatable record.
export function loadBestScore(key: string): number {
  try {
    const value = Number(accountStorage.getItem(key))
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

export function saveBestScore(key: string, score: number): void {
  if (!Number.isSafeInteger(score) || score < 0) return
  try {
    accountStorage.setItem(key, String(score))
  } catch {
    /* The current result remains visible. */
  }
}
