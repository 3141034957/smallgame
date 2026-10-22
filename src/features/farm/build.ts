import { evolved, MAX_EQUIPPED, RECIPES, TALENTS, type Gear, type TalentId } from './rules.mjs'
import type { Combo } from './schools.mjs'

export type FarmBuildItem = {
  weapon: TalentId
  chip: TalentId
  weaponIsMember: boolean
  weaponName: string
  chipName: string
  weaponIcon: string
  chipIcon: string
  weaponLevel: number
  chipLevel: number
  evolved: boolean
  evolutionBlocked: boolean
  form: string
}

const carried = (gear: Gear, kind: 'weapon' | 'chip') =>
  TALENTS.filter((talent) => talent.kind === kind && gear[talent.id] > 0).length

// The result page lists the whole band: what the player built and which pairs
// reached their final form in that run.
export function farmBuildSummary(gear: Gear): FarmBuildItem[] {
  const forms = evolved(gear)
  const weaponSlots = MAX_EQUIPPED - carried(gear, 'weapon')
  const chipSlots = MAX_EQUIPPED - carried(gear, 'chip')
  return RECIPES.map((recipe) => {
    const weapon = TALENTS.find((talent) => talent.id === recipe.weapon)!
    const chip = TALENTS.find((talent) => talent.id === recipe.chip)!
    return {
      weapon: recipe.weapon,
      chip: recipe.chip,
      weaponIsMember: Boolean(weapon.characterId),
      weaponName: weapon.name,
      chipName: chip.name,
      weaponIcon: weapon.icon,
      chipIcon: chip.icon,
      weaponLevel: gear[recipe.weapon] ?? 0,
      chipLevel: gear[recipe.chip] ?? 0,
      evolved: forms.includes(recipe.weapon),
      evolutionBlocked:
        (!(gear[recipe.weapon] > 0) && weaponSlots <= 0) ||
        (!(gear[recipe.chip] > 0) && chipSlots <= 0),
      form: recipe.name,
    }
  })
}

// A near combo is only a next step while all of its missing pieces still fit.
// Check the whole pair of schools together: two individually available chips
// can still compete for the same final slot.
export function farmComboReachable(gear: Gear, combo: Pick<Combo, 'requires' | 'any'>): boolean {
  const weaponSlots = Math.max(0, MAX_EQUIPPED - carried(gear, 'weapon'))
  const chipSlots = Math.max(0, MAX_EQUIPPED - carried(gear, 'chip'))
  const pairs = RECIPES.map((recipe) => ({
    weapon: recipe.weapon,
    hasWeapon: (gear[recipe.weapon] ?? 0) > 0,
    hasChip: (gear[recipe.chip] ?? 0) > 0,
  }))
  if (combo.any) {
    const complete = pairs.filter((pair) => pair.hasWeapon && pair.hasChip).length
    const weaponOnly = pairs.filter((pair) => pair.hasWeapon && !pair.hasChip).length
    const chipOnly = pairs.filter((pair) => !pair.hasWeapon && pair.hasChip).length
    const untouched = pairs.filter((pair) => !pair.hasWeapon && !pair.hasChip).length
    const addChip = Math.min(weaponOnly, chipSlots)
    const addWeapon = Math.min(chipOnly, weaponSlots)
    const addPair = Math.min(untouched, chipSlots - addChip, weaponSlots - addWeapon)
    return complete + addChip + addWeapon + addPair >= combo.any
  }
  const required = new Set(combo.requires)
  const selected = pairs.filter((pair) => required.has(pair.weapon))
  return (
    selected.length === required.size &&
    selected.filter((pair) => !pair.hasWeapon).length <= weaponSlots &&
    selected.filter((pair) => !pair.hasChip).length <= chipSlots
  )
}

export const farmBuiltLevels = (gear: Gear) =>
  TALENTS.reduce((sum, talent) => sum + (gear[talent.id] ?? 0), 0)
