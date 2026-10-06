export type Lane = 0 | 1 | 2 | 3
export type Difficulty = 'cozy' | 'groove' | 'party'
export type Grade = 'perfect' | 'good' | 'miss'
export type MelodyNote = { id: number; lane: Lane; time: number; midi: number }
export type MelodySong = {
  id: string
  name: string
  subtitle: string
  bpm: number
  beats: number
  seed: number
  unlock: number
  color: string
  emoji: string
  melody: readonly number[]
}

export type RunState = {
  grades: Record<number, Grade>
  score: number
  combo: number
  maxCombo: number
  perfect: number
  good: number
  misses: number
  ghosts: number
}
export const SONGS: readonly MelodySong[]
export const DIFFICULTIES: readonly { id: Difficulty; name: string; description: string }[]
export const PERFECT_WINDOW: number
export const HIT_WINDOW: number
export const NOTE_TRAVEL_SECONDS: number
export function makeChart(
  song: MelodySong,
  difficulty: Difficulty,
  practice?: boolean,
): MelodyNote[]
export function emptyRun(): RunState
export function advanceRun(run: RunState, notes: readonly MelodyNote[], time: number): RunState
export function hitNote(
  run: RunState,
  notes: readonly MelodyNote[],
  lane: Lane,
  time: number,
): { run: RunState; note: MelodyNote | null; grade: Grade | null }
export function runAccuracy(run: RunState, count: number): number
export function runStars(run: RunState, count: number): number
