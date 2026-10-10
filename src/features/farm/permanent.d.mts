export type PermanentId = string
export type PermanentLevels = Record<PermanentId, number>
export type FarmGrowth = { levels: PermanentLevels; spent: number }
export const RECOVERY: {
  safeSeconds: number
  regenSeconds: number
}
export const SHIELD_BASE_SECONDS: number
export const PERMANENT_BRANCHES: { id: string; name: string; icon: string }[]
export const PERMANENT_KINDS: {
  kind: string
  branch: string
  icon: string
  quota: number
  amount: number
  label: string
}[]
export const PERMANENT_STEPS: {
  kind: string
  branch: string
  icon: string
  amount: number
  label: string
}[]
export const PERMANENT_UPGRADES: {
  id: PermanentId
  name: string
  icon: string
  branch: string
  kind: string
  amount: number
  order: number
  max: number
  price: number
}[]
export const PERMANENT_CHAIN: typeof PERMANENT_UPGRADES
export const PERMANENT_TOTAL_LEVELS: number
export function normalizePermanentLevels(value?: unknown): PermanentLevels
export function validPermanentLevels(value: unknown): boolean
export function permanentLevelCount(value?: unknown): number
export function permanentNextStep(value?: unknown): PermanentId | null
export function permanentIsUnlocked(value: unknown, id: string): boolean
export function permanentPrice(id: string, level: number): number | null
export function permanentEffect(id: string, level: number): string
export function permanentStats(value?: unknown): {
  maxHp: number
  damage: number
  speed: number
  attraction: number
  xp: number
  armor: number
  regen: number
  shieldSeconds: number
}
