import type { Lane } from '../melody/engine'
export { todayRoute, validDay } from '../island/rules.mjs'
export const SIZE: number
export const DURATION: number
export const CHARGE: number
export type Tile = { id: number; lane: Lane; kind: 'note' | 'bomb' | 'rainbow' }
export type WaveAction =
  { t: number; path: number[]; boost?: never } | { t: number; boost: true; path?: never }
export type WaveState = {
  day: string
  seed: number
  nextId: number
  board: Tile[]
  score: number
  combo: number
  maxCombo: number
  charge: number
  clears: number
  bombs: number
  boosts: number
  lastTime: number
  turn: number
}
export type WaveNotes = { lane: Lane; midi: number }[]
export type WaveResult = {
  state: WaveState
  removed: number[]
  earned: number
  multiplier: number
  created: Tile['kind'] | null
  triggered: number
  lead: Lane
  boost: boolean
  reshuffled: boolean
  notes: WaveNotes
}
export type WaveRound = {
  day: string
  actions: WaveAction[]
  score: number
  maxCombo: number
  clears: number
  bombs: number
  boosts: number
  stars: number
}
export function adjacent(a: number, b: number): boolean
export function validPath(board: Tile[], path: unknown): boolean
export function findMove(board: Tile[]): number[] | null
export function createWave(day: string): WaveState
export function playWave(state: WaveState, action: WaveAction): WaveResult | null
export function replayWave(day: string, actions: WaveAction[]): WaveRound | null
