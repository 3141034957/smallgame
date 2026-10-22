import { describe, expect, it } from 'vitest'
import { createFarm, type Gear } from './rules.mjs'
import { upgradeGuidance } from './upgradeGuidance'

const gearWith = (extra: Partial<Gear>): Gear => ({ ...createFarm('2026-10-04').gear, ...extra })

describe('upgrade build guidance', () => {
  it('identifies a new matching pick and the actual level of its carried partner', () => {
    const gear = gearWith({ drum: 3 })
    expect(upgradeGuidance(gear, 'range')).toEqual({
      partner: { id: 'drum', name: '鼓手咚咚', level: 3 },
      completesPair: true,
      blockedSchools: [],
    })
    expect(upgradeGuidance(gearWith({ drum: 3, range: 1 }), 'range').completesPair).toBe(false)
    expect(upgradeGuidance(gear, 'tempo').partner).toBeNull()
  })

  it('names every newly blocked school when the final chip slot is filled', () => {
    const gear = gearWith({
      drum: 2,
      synth: 1,
      orbit: 1,
      magnet: 1,
      lucky: 1,
      sustain: 1,
      delay: 1,
    })
    const before = { ...gear }
    const result = upgradeGuidance(gear, 'tempo')
    expect(result.completesPair).toBe(true)
    expect(result.blockedSchools).toEqual([
      {
        id: 'drum',
        name: '鼓组流',
        missingId: 'range',
        missingName: '共鸣音箱',
        missingKind: 'chip',
      },
      {
        id: 'synth',
        name: '合成器流',
        missingId: 'arp',
        missingName: '琶音器',
        missingKind: 'chip',
      },
    ])
    expect(gear).toEqual(before)
  })

  it('does not warn while another chip slot remains', () => {
    const gear = gearWith({ drum: 2, magnet: 1, lucky: 1, sustain: 1 })
    expect(upgradeGuidance(gear, 'tempo').blockedSchools).toEqual([])
  })

  it('does not block the matching school when its partner fills the final slot', () => {
    const gear = gearWith({ drum: 2, tempo: 1, magnet: 1, lucky: 1, sustain: 1 })
    expect(upgradeGuidance(gear, 'range').blockedSchools).toEqual([])
  })

  it('handles chip-first schools when the final weapon slot is filled', () => {
    const gear = gearWith({
      orbit: 1,
      power: 1,
      echo: 1,
      bell: 1,
      range: 1,
      arp: 1,
      tempo: 1,
    })
    expect(upgradeGuidance(gear, 'whistle').blockedSchools.map((school) => school.id)).toEqual([
      'drum',
      'synth',
    ])
    expect(
      upgradeGuidance(gear, 'whistle').blockedSchools.every(
        (school) => school.missingKind === 'weapon',
      ),
    ).toBe(true)
  })

  it('warns for a new weapon whose missing chip is already locked out', () => {
    const gear = gearWith({ tempo: 1, magnet: 1, lucky: 1, sustain: 1, delay: 1 })
    expect(upgradeGuidance(gear, 'drum').blockedSchools.map((school) => school.id)).toEqual([
      'drum',
    ])
    expect(upgradeGuidance(gear, 'orbit').blockedSchools).toEqual([])
  })

  it('warns for a new chip whose missing weapon is already locked out', () => {
    const gear = gearWith({ orbit: 1, power: 1, echo: 1, bell: 1, whistle: 1 })
    expect(upgradeGuidance(gear, 'range').blockedSchools.map((school) => school.id)).toEqual([
      'drum',
    ])
    expect(upgradeGuidance(gear, 'tempo').blockedSchools).toEqual([])
  })

  it('does not repeat an unrelated school that was already blocked', () => {
    const gear = gearWith({ drum: 1, tempo: 1, magnet: 1, lucky: 1, sustain: 1, delay: 1 })
    expect(upgradeGuidance(gear, 'synth').blockedSchools.map((school) => school.id)).toEqual([
      'synth',
    ])
  })

  it('keeps existing upgrades and recovery or growth cards free of slot warnings', () => {
    const gear = gearWith({ drum: 1, tempo: 1, magnet: 1, lucky: 1, sustain: 1, delay: 1 })
    for (const id of ['drum', 'tempo', 'heal', 'vigor'] as const)
      expect(upgradeGuidance(gear, id).blockedSchools).toEqual([])
  })
})
