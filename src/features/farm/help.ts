// The rules open by themselves on the first visit only; later visits keep the
// "?" button silent until the player asks for them.
export const FARM_HELP_SEEN_KEY = 'farm-seen-help-v1'

import { MAX_GEAR_LEVEL, type TalentId } from './rules.mjs'
import {
  activeCombos,
  COMBOS,
  comboProgress,
  schoolProgress,
  SCHOOLS,
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

// Short on purpose: the card already names the school, so the ladder only has
// to say how far it got ("Lv.2/5") or that it is done ("终极").
const layerLabel = (tier: number, evolved: boolean) =>
  evolved ? '终极' : `Lv.${tier}/${MAX_GEAR_LEVEL}`

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
  SCHOOLS.find((school) => school.weapon === id || school.chip === id)

export const activeSchoolCombos = (source: ComboSource): Combo[] => activeCombos(source)

export type ComboHint = { combo: Combo; missing: string }

// "差一点就达成" — what the result screen suggests as the next step. `missing`
// is the data layer's own sentence ("还差 …"), so it prints as-is.
export function schoolComboHints(source: ComboSource): ComboHint[] {
  const byId = new Map(COMBOS.map((combo) => [combo.id, combo]))
  return comboProgress(source)
    .near.map((entry) => ({ combo: byId.get(entry.id), missing: entry.missing }))
    .filter((entry): entry is ComboHint => Boolean(entry.combo))
}

// `requirement` and `effect` already carry the data layer's own wording, so
// the screens print them as-is instead of recomputing the bonus numbers.
export const SCHOOL_COMBOS = COMBOS
export const SCHOOL_LIST = SCHOOLS
