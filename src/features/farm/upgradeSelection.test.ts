import { expect, it } from 'vitest'
import { selectFarmUpgrade } from './upgradeSelection'
import { createFarm, farmXpThreshold, MAX_GEAR_LEVEL, stepFarm, TALENTS } from './rules.mjs'

const fullLoadout = () => {
  const state = createFarm('2026-10-04')
  for (const kind of ['weapon', 'chip'])
    for (const talent of TALENTS.filter((item) => item.kind === kind).slice(0, 5))
      state.gear[talent.id] = MAX_GEAR_LEVEL
  return {
    ...state,
    level: 50,
    hp: 7,
    crops: [],
    nextWave: Infinity,
    nextBoss: Infinity,
    nextBass: Infinity,
  }
}

it('records just the one healing pick: an exhausted pool now deals growth cards too', () => {
  const initial = { ...fullLoadout(), xp: farmXpThreshold(250) + 9 }
  const offered = stepFarm(initial, initial.position)!.state
  const saved = structuredClone(offered)
  // A dry pool used to be a lone healing card that the click consumed in one
  // long chain. It now deals a full hand led by the heal, so the automatic
  // chain stops after the pick that was actually asked for.
  expect(offered.offered[0]).toBe('heal')
  expect(offered.offered.length).toBeGreaterThan(1)
  const selected = selectFarmUpgrade(offered, 'heal')!
  expect(selected.state).toMatchObject({ level: 51, hp: 100, tick: offered.tick })
  expect(selected.state.xp - farmXpThreshold(250)).toBe(9)
  expect(selected.state.gear).toEqual(offered.gear)
  expect(selected.choices).toEqual([{ tick: offered.tick, id: 'heal' }])
  expect(offered).toEqual(saved)
  // The next hand is waiting for a real choice, so the clock stays put.
  expect(stepFarm(selected.state, selected.state.position)).toBeNull()
})

it('stops automatic selection when the next level has multiple options', () => {
  const state = createFarm('2026-10-04')
  state.level = 1
  state.gear.drum = 1
  state.offered = ['drum']
  state.xp = farmXpThreshold(3)
  const selected = selectFarmUpgrade(state, 'drum')!
  expect(selected.state.level).toBe(2)
  expect(selected.state.offered.length).toBeGreaterThan(1)
  expect(selected.choices).toEqual([{ tick: 0, id: 'drum' }])
})

it('finishes only the manual pick: the level after it is a dry-pool hand, not a sole option', () => {
  const state = fullLoadout()
  const last = TALENTS.filter((item) => state.gear[item.id] > 0).at(-1)!
  state.gear[last.id] = MAX_GEAR_LEVEL - 1
  state.offered = [last.id, 'heal']
  state.xp = farmXpThreshold(53)
  const selected = selectFarmUpgrade(state, last.id)!
  expect(selected.state).toMatchObject({ level: 51 })
  expect(selected.state.gear[last.id]).toBe(MAX_GEAR_LEVEL)
  // Maxing the last instrument drains the pool, so the following levels deal
  // heal plus growth cards and are left for the player instead of chaining.
  expect(selected.state.offered.length).toBeGreaterThan(1)
  expect(selected.choices.map((choice) => choice.id)).toEqual([last.id])
})

it('rejects invalid choices and does not automatically revive a defeated player', () => {
  const state = { ...fullLoadout(), offered: ['heal' as const] }
  expect(selectFarmUpgrade(state, 'drum')).toBeNull()
  expect(selectFarmUpgrade({ ...state, hp: 0 }, 'heal')).toBeNull()
})
