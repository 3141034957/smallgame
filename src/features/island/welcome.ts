import type { Journey } from './rules.mjs'

const KEY = 'mochi-island-first-song-v1'
export const FIRST_SONG_PATH = [7, 2, 1, 0] as const
export function firstSongStep(journey: Journey) {
  if (journey.friends.includes(1)) return 4
  return Math.min(3, journey.actions.filter((action) => action.type === 'move').length)
}
export function hasPlayedFirstSong() {
  try { return localStorage.getItem(KEY) === 'done' } catch { return false }
}
export function rememberFirstSong() {
  try { localStorage.setItem(KEY, 'done') } catch { /* The tour is still completed in memory. */ }
}
