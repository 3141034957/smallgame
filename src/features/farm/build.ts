import { evolved, RECIPES, TALENTS, type Gear, type TalentId } from './rules.mjs'

export type FarmBuildItem = {
  weapon: TalentId
  chip: TalentId
  weaponName: string
  chipName: string
  weaponIcon: string
  chipIcon: string
  weaponLevel: number
  chipLevel: number
  evolved: boolean
  form: string
}

// The result page lists the whole band: what the player built and which pairs
// reached their final form in that run.
export function farmBuildSummary(gear: Gear): FarmBuildItem[] {
  const forms = evolved(gear)
  return RECIPES.map((recipe) => {
    const weapon = TALENTS.find((talent) => talent.id === recipe.weapon)!
    const chip = TALENTS.find((talent) => talent.id === recipe.chip)!
    return {
      weapon: recipe.weapon, chip: recipe.chip,
      weaponName: weapon.name, chipName: chip.name,
      weaponIcon: weapon.icon, chipIcon: chip.icon,
      weaponLevel: gear[recipe.weapon] ?? 0, chipLevel: gear[recipe.chip] ?? 0,
      evolved: forms.includes(recipe.weapon), form: recipe.name,
    }
  })
}

export const farmBuiltLevels = (gear: Gear) => TALENTS.reduce((sum, talent) => sum + (gear[talent.id] ?? 0), 0)
