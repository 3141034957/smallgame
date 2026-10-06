import { describe, expect, it } from 'vitest'
import { farmBuildSummary, farmBuiltLevels } from './build'
import { MAX_GEAR_LEVEL, RECIPES, TALENTS, type Gear } from './rules.mjs'

const gear = (): Gear => Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])) as Gear

describe('run build summary', () => {
  it('lists every recipe with empty levels and flags the evolved pairs', () => {
    const empty = farmBuildSummary(gear())
    expect(empty).toHaveLength(RECIPES.length)
    expect(
      empty.every((item) => !item.evolved && item.weaponLevel === 0 && item.chipLevel === 0),
    ).toBe(true)
    expect(farmBuiltLevels(gear())).toBe(0)
    const built: Gear = { ...gear(), drum: MAX_GEAR_LEVEL, range: MAX_GEAR_LEVEL, echo: 2 }
    const summary = farmBuildSummary(built)
    const drum = summary.find((item) => item.weapon === 'drum')!
    expect(drum.evolved).toBe(true)
    expect(drum.form).toBe(RECIPES.find((recipe) => recipe.weapon === 'drum')!.name)
    expect(summary.find((item) => item.weapon === 'echo')!.evolved).toBe(false)
    expect(summary.find((item) => item.weapon === 'echo')!.weaponLevel).toBe(2)
    expect(farmBuiltLevels(built)).toBe(MAX_GEAR_LEVEL * 2 + 2)
  })
  it('tolerates missing gear entries', () => {
    const summary = farmBuildSummary({} as Gear)
    expect(summary.every((item) => item.weaponLevel === 0)).toBe(true)
    expect(farmBuiltLevels({} as Gear)).toBe(0)
  })
})
