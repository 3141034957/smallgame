import { describe, expect, it } from 'vitest'
import { farmBuildSummary, farmBuiltLevels, farmComboReachable } from './build'
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

  it('marks a missing partner as blocked only when its own slot kind is full', () => {
    const built = {
      ...gear(),
      drum: 2,
      synth: 1,
      tempo: 1,
      magnet: 1,
      lucky: 1,
      sustain: 1,
      delay: 1,
    }
    const summary = farmBuildSummary(built)
    expect(summary.find((item) => item.weapon === 'drum')!.evolutionBlocked).toBe(true)
    expect(summary.find((item) => item.weapon === 'synth')!.evolutionBlocked).toBe(true)
    expect(summary.find((item) => item.chip === 'tempo')!.evolutionBlocked).toBe(false)
    expect(
      farmBuildSummary({ ...built, delay: 0, range: 1 }).find((item) => item.weapon === 'drum')!
        .evolutionBlocked,
    ).toBe(false)
  })

  it('does not suggest two recipes that need the same last chip slot', () => {
    const built = {
      ...gear(),
      drum: 5,
      synth: 5,
      tempo: 1,
      magnet: 1,
      lucky: 1,
      sustain: 1,
    }
    expect(farmComboReachable(built, { requires: ['drum'] })).toBe(true)
    expect(farmComboReachable(built, { requires: ['synth'] })).toBe(true)
    expect(farmComboReachable(built, { requires: ['drum', 'synth'] })).toBe(false)
    expect(farmComboReachable({ ...built, sustain: 0 }, { requires: ['drum', 'synth'] })).toBe(true)
  })

  it('respects the weapon slots as well as chips when evaluating a combo', () => {
    const built = {
      ...gear(),
      range: 5,
      arp: 5,
      orbit: 1,
      power: 1,
      echo: 1,
      bell: 1,
    }
    expect(farmComboReachable(built, { requires: ['drum', 'synth'] })).toBe(false)
    expect(farmComboReachable({ ...built, bell: 0 }, { requires: ['drum', 'synth'] })).toBe(true)
  })

  it('counts only pairings that fit when suggesting an arbitrary third evolution', () => {
    const built = {
      ...gear(),
      drum: 5,
      range: 5,
      synth: 5,
      arp: 5,
      orbit: 1,
      echo: 1,
      bell: 1,
      magnet: 1,
      mute: 1,
      delay: 1,
    }
    const encore = { requires: [], any: 3 }
    expect(farmComboReachable(built, encore)).toBe(false)
    expect(farmComboReachable({ ...built, delay: 0 }, encore)).toBe(true)
    expect(farmComboReachable(gear(), { requires: [], any: 5 })).toBe(true)
    expect(farmComboReachable(gear(), { requires: [], any: 6 })).toBe(false)
  })

  it('can finish two one-sided pairs with one remaining slot of each kind', () => {
    const built = {
      ...gear(),
      drum: 1,
      range: 1,
      synth: 1,
      arp: 1,
      echo: 1,
      lucky: 1,
      orbit: 1,
      magnet: 1,
    }
    expect(farmComboReachable(built, { requires: [], any: 5 })).toBe(true)
  })

  it('rejects unknown recipes without treating them as already complete', () => {
    expect(farmComboReachable(gear(), { requires: ['missing'] })).toBe(false)
  })
})
