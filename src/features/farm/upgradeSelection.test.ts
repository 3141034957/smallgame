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

it('automatically consumes consecutive single healing choices and records each without advancing time', () => {
  const initial = { ...fullLoadout(), xp: farmXpThreshold(250) + 9 }
  const offered = stepFarm(initial, initial.position)!.state
  const saved = structuredClone(offered)
  const selected = selectFarmUpgrade(offered, offered.offered[0])!
  expect(selected.state).toMatchObject({ level: 250, hp: 100, offered: [], tick: offered.tick })
  expect(selected.state.xp - farmXpThreshold(250)).toBe(9)
  expect(selected.state.gear).toEqual(offered.gear)
  expect(selected.choices).toEqual(
    Array.from({ length: 200 }, () => ({ tick: offered.tick, id: 'heal' })),
  )
  expect(offered).toEqual(saved)
  expect(stepFarm(selected.state, selected.state.position)!.state.tick).toBe(offered.tick + 1)
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

it('finishes the selected upgrade and any following sole options after a manual multi-choice pick', () => {
  const state = fullLoadout()
  const last = TALENTS.filter((item) => state.gear[item.id] > 0).at(-1)!
  state.gear[last.id] = MAX_GEAR_LEVEL - 1
  state.offered = [last.id, 'heal']
  state.xp = farmXpThreshold(53)
  const selected = selectFarmUpgrade(state, last.id)!
  expect(selected.state).toMatchObject({ level: 53, hp: 100, offered: [] })
  expect(selected.state.gear[last.id]).toBe(MAX_GEAR_LEVEL)
  expect(selected.choices.map((choice) => choice.id)).toEqual([last.id, 'heal', 'heal'])
})

it('rejects invalid choices and does not automatically revive a defeated player', () => {
  const state = { ...fullLoadout(), offered: ['heal' as const] }
  expect(selectFarmUpgrade(state, 'drum')).toBeNull()
  expect(selectFarmUpgrade({ ...state, hp: 0 }, 'heal')).toBeNull()
})
