import type { Crop, Lane } from './rules.mjs'
export const FARM_RULESET: string
export const FARM_SCORE_PREFIX: string
export function farmBestKey(day: string): string
export type Monster = {
  id: string
  name: string
  kind: Lane
  starts: number
  size: number
  image: string
  attack: string
  boss?: boolean
  interval?: number
}
export const MONSTERS: Monster[]
export function regularMonsterKind(tick: number, fps: number, id: number): Lane
export function monsterFor(enemy: Pick<Crop, 'kind' | 'boss' | 'bass' | 'elite'>): Monster
