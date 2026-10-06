export type PermanentId =
  'vitality' | 'armor' | 'regen' | 'shield' | 'power' | 'wisdom' | 'stride' | 'magnet'
export type PermanentLevels = Record<PermanentId, number>
export type FarmGrowth = { levels: PermanentLevels; spent: number }
export const PERMANENT_BRANCHES: { id: string; name: string; icon: string }[]
export const PERMANENT_UPGRADES: {
  id: PermanentId
  branch: string
  name: string
  icon: string
  max: number
  base?: number
  prices?: number[]
  description: string
}[]
export const PERMANENT_TOTAL_LEVELS: number
export function normalizePermanentLevels(value?: unknown): PermanentLevels
export function validPermanentLevels(value: unknown): boolean
export function permanentLevelCount(value?: unknown): number
export function permanentPrice(id: string, level: number): number | null
export function permanentEffect(id: string, level: number): string
export function permanentStats(value?: unknown): {
  maxHp: number
  damage: number
  speed: number
  attraction: number
  xp: number
  damageTaken: number
  regen: number
  shieldSeconds: number
}
