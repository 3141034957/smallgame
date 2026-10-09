export type PermanentId =
  | 'step-1'
  | 'step-2'
  | 'step-3'
  | 'step-4'
  | 'step-5'
  | 'step-6'
  | 'step-7'
  | 'step-8'
  | 'step-9'
  | 'step-10'
  | 'step-11'
  | 'step-12'
  | 'step-13'
  | 'step-14'
  | 'step-15'
  | 'step-16'
  | 'step-17'
  | 'step-18'
  | 'step-19'
  | 'step-20'
  | 'step-21'
  | 'step-22'
  | 'step-23'
  | 'step-24'
  | 'step-25'
  | 'step-26'
  | 'step-27'
  | 'step-28'
  | 'step-29'
export type PermanentLevels = Record<PermanentId, number>
export type FarmGrowth = { levels: PermanentLevels; spent: number }
export const RECOVERY: {
  safeSeconds: number
  regenSeconds: number
  shieldSeconds: number[]
}
export const PERMANENT_BRANCHES: { id: string; name: string; icon: string }[]
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
export function legacyStepCount(value?: unknown): number
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
