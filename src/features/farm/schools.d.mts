import type { Gear, TalentId } from './rules.mjs'

export type School = {
  id: string
  name: string
  style: string
  tagline: string
  weapon: TalentId
  chip: TalentId
  weaponName: string
  chipName: string
  weaponIcon: string
  chipIcon: string
  color: string
  form: string
  formIcon: string
  formDescription: string
}

export type SchoolProgress = School & {
  weaponLevel: number
  chipLevel: number
  // 0 未接触 · 1 已有核心乐器 · 2 乐器与芯片齐备 · 3 其中一件满级 · 4 已进化
  tier: number
  evolved: boolean
  remaining: number
}

export type Combo = {
  id: string
  name: string
  icon: string
  requires: string[]
  any?: number
  tagline: string
  bonus: Record<string, number>
}

export type ComboProgress = Combo & {
  schools: string[]
  missing: string[]
}

// Combo and school lookups accept the live run or a bare gear map.
export type ComboSource = Gear | { gear: Gear }

export const RESONANCE_STORM_DAMAGE: number
export const RESONANCE_STORM_AREA: number
export const BASS_TRAP_RESIDUE: number
export const BASS_TRAP_ATTRACTION: number
export const METAL_ECHO_BLADE: number
export const METAL_ECHO_ORBIT: number
export const METAL_ECHO_RICOCHET: number
export const STAR_CHOIR_SHOCK: number
export const STAR_CHOIR_RAIN: number
export const BRASS_FRENZY_HORN: number
export const BRASS_FRENZY_MINE: number
export const FULL_ENCORE_DAMAGE: number
export const FULL_ENCORE_ATTRACTION: number
export const FULL_ENCORE_SCHOOLS: number
export const COMBO_BONUS_KEYS: string[]
export const COMBOS: Combo[]
export function schools(): School[]
export function schoolById(id: string): School | undefined
export function activeCombos(source: ComboSource): Combo[]
export function comboModifiers(source: ComboSource): Record<string, number>
export function schoolProgress(source: ComboSource): SchoolProgress[]
export function comboProgress(source: ComboSource): {
  active: ComboProgress[]
  close: ComboProgress[]
  evolvedSchools: number
}
