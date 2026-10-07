// The rules open by themselves on the first visit only; later visits keep the
// "?" button silent until the player asks for them.
export const FARM_HELP_SEEN_KEY = 'farm-seen-help-v1'

import { MAX_GEAR_LEVEL, type TalentId } from './rules.mjs'
import {
  activeCombos,
  COMBOS,
  comboProgress,
  schoolProgress,
  schools,
  type Combo,
  type ComboSource,
  type School,
} from './schools.mjs'

export type { Combo, School }
export type ComboState = ComboSource

// The ladder the result screen draws under a school: I → V, where V is the
// 终极 form. `tier` comes from the data layer (0–4).
export const SCHOOL_ROMAN = ['I', 'II', 'III', 'IV', 'V']

export type SchoolView = {
  school: School
  weapon: TalentId
  chip: TalentId
  weaponName: string
  chipName: string
  weaponLevel: number
  chipLevel: number
  // 0 未接触 … 4 已进化, straight from `schoolProgress`.
  tier: number
  evolved: boolean
  remaining: number
  layerLabel: string
}

const layerLabel = (tier: number, evolved: boolean) => {
  if (evolved) return `已进化 · 第 ${MAX_GEAR_LEVEL} 层 / 共 ${MAX_GEAR_LEVEL} 层`
  if (tier === 0) return `未接触 · 0 / ${MAX_GEAR_LEVEL} 层`
  return `第 ${tier} 层 / 共 ${MAX_GEAR_LEVEL} 层`
}

export function schoolViews(source: ComboSource): SchoolView[] {
  return schoolProgress(source).map((entry) => ({
    school: entry,
    weapon: entry.weapon,
    chip: entry.chip,
    weaponName: entry.weaponName,
    chipName: entry.chipName,
    weaponLevel: entry.weaponLevel,
    chipLevel: entry.chipLevel,
    tier: entry.tier,
    evolved: entry.evolved,
    remaining: entry.remaining,
    layerLabel: layerLabel(entry.tier, entry.evolved),
  }))
}

// Only schools the player actually touched belong on the result screen.
export const startedSchoolViews = (source: ComboSource): SchoolView[] =>
  schoolViews(source).filter((view) => view.tier > 0)

export const schoolOfTalent = (id: TalentId): School | undefined =>
  schools().find((school) => school.weapon === id || school.chip === id)

export const schoolNameById = (id: string) =>
  schools().find((school) => school.id === id)?.name ?? id

export const activeSchoolCombos = (source: ComboSource): Combo[] => activeCombos(source)

export type ComboHint = { combo: Combo; missing: string }

// "差一点就达成" — what the result screen suggests as the next step.
export function schoolComboHints(source: ComboSource): ComboHint[] {
  return comboProgress(source).close.map((entry) => ({
    combo: entry,
    missing: entry.missing.length
      ? `${entry.missing.join('、')} 进化`
      : `再进化 1 个流派（已 ${entry.schools.length} 个）`,
  }))
}

// Help-page wording: a combo either needs named schools or a count of any.
export const comboRequirement = (combo: Combo) =>
  combo.any
    ? `任意 ${combo.any} 个流派进化`
    : `${combo.requires.map(schoolNameById).join(' ＋ ')} 都进化`

// The data layer feeds `bonus` straight into combat, so the UI only reads it.
const BONUS_LABELS: Record<string, string> = {
  damage: '全局伤害',
  attraction: '掉落磁吸',
  blast: '爆破伤害',
  blastArea: '爆破范围',
  fan: '扇形伤害',
  fanArea: '扇形范围',
  residue: '残留伤害',
  orbit: '环绕音刃',
  blade: '音刃伤害',
  ricochet: '回响弹',
  shock: '环形冲击',
  rain: '追踪音雨',
  horn: '号角冲刺',
  mine: '音爆地雷',
}

export const comboBonusText = (combo: Combo) =>
  Object.entries(combo.bonus)
    .map(([key, value]) => `${BONUS_LABELS[key] ?? key} +${Math.round(value * 100)}%`)
    .join(' · ')

export const SCHOOL_COMBOS = COMBOS
export const SCHOOL_LIST = schools()
