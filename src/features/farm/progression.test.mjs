import { describe, expect, it } from 'vitest'
import {
  EXPERIENCE_STAGES,
  FPS,
  RECIPES,
  THRESHOLDS,
  UPGRADE_STEPS,
  UPGRADE_XP,
  chooseTalent,
  createFarm,
  stepFarm,
} from './rules.mjs'
import { modifierDays, simulateFarm } from '../../../scripts/check-farm-balance.mjs'

const arena = (tick = 0) => ({
  ...createFarm('2026-10-04'),
  tick,
  crops: [],
  position: [50, 50],
  nextWave: Infinity,
  nextBoss: Infinity,
  nextBass: Infinity,
  modifier: 'none',
})
function spawn(tick) {
  const state = arena(tick)
  state.nextWave = tick
  return stepFarm(state, state.position).state.crops.find((enemy) => !enemy.elite)
}
function reward(enemy, tick, lucky = 0, modifier = 'none') {
  const state = arena(tick)
  state.modifier = modifier
  state.gear.lucky = lucky
  // A surge is the one attack that never depends on the tick or on a weapon:
  // it is what banks the reward so the drop can be measured.
  state.charge = 100
  state.crops = [{ ...enemy, hp: 1, x: 50, y: 50, spawnAt: 0 }]
  return stepFarm(state, state.position, true).state
}

describe('farm experience progression', () => {
  it('increases every upgrade cost, with cumulative thresholds for a full loadout', () => {
    expect(UPGRADE_XP).toHaveLength(UPGRADE_STEPS)
    expect(UPGRADE_XP.slice(0, 6)).toEqual([20, 41, 62, 85, 109, 134])
    for (let index = 0; index < UPGRADE_XP.length; index++) {
      expect(Number.isSafeInteger(UPGRADE_XP[index])).toBe(true)
      expect(UPGRADE_XP[index]).toBeGreaterThan(UPGRADE_XP[index - 1] ?? 0)
      expect(THRESHOLDS[index] - (THRESHOLDS[index - 1] ?? 0)).toBe(UPGRADE_XP[index])
    }
    expect(UPGRADE_XP.at(-1)).toBe(
      20 + 20 * (UPGRADE_XP.length - 1) + Math.round(0.55 * (UPGRADE_XP.length - 1) ** 2),
    )
  })

  it('does not upgrade early and carries pickup overflow through consecutive choices', () => {
    let state = arena()
    state.xp = THRESHOLDS[0] - 1
    state = stepFarm(state, state.position).state
    expect(state.offered).toEqual([])
    state.loot = [{ id: 200, x: 50, y: 50, xp: THRESHOLDS[2] + 7 - state.xp, coins: 0 }]
    state = stepFarm(state, state.position).state
    const xp = state.xp,
      tick = state.tick
    for (let index = 0; index < 3; index++) {
      expect(state.offered.length).toBeGreaterThan(0)
      expect(stepFarm(state, state.position)).toBeNull()
      state = chooseTalent(state, state.offered[0])
    }
    expect(state.level).toBe(3)
    expect(state.xp).toBe(xp)
    expect(state.xp - THRESHOLDS[2]).toBe(7)
    expect(state.tick).toBe(tick)
    expect(state.offered).toEqual([])
  })

  it('assigns new monsters to the correct stage on both sides of every boundary', () => {
    for (let index = 1; index < EXPERIENCE_STAGES.length; index++) {
      const boundary = EXPERIENCE_STAGES[index].seconds * FPS
      expect(spawn(boundary - 1).xpStage).toBe(index - 1)
      expect(spawn(boundary).xpStage).toBe(index)
    }
    expect(spawn(FPS * 3600).xpStage).toBe(EXPERIENCE_STAGES.length - 1)
  })

  it('scales regular, elite and both boss rewards while preserving coin rewards and modifiers', () => {
    const categories = [
      { flags: {}, base: 5 },
      { flags: { elite: true }, base: 30 },
      { flags: { boss: true }, base: 60 },
      { flags: { boss: true, bass: true }, base: 110 },
    ]
    for (const { flags, base } of categories) {
      let previousXp = 0
      const first = reward({ ...spawn(0), ...flags }, 0)
      for (const { seconds, multiplier } of EXPERIENCE_STAGES) {
        const tick = seconds * FPS
        const monster = { ...spawn(tick), kind: 0, ...flags }
        const result = reward(monster, tick)
        expect(result.xp).toBe(Math.round(base * multiplier))
        expect(result.xp).toBeGreaterThan(previousXp)
        expect(result.coins).toBe(first.coins)
        expect(reward(monster, tick, 0, 'golden').xp).toBe(Math.round(base * multiplier * 1.5))
        previousXp = result.xp
      }
    }
    expect(reward(spawn(120 * FPS), 120 * FPS, 3, 'golden').xp).toBe(24)
  })

  it('keeps old monster and loose-drop rewards fixed when the clock advances', () => {
    const monster = spawn(0)
    expect(reward(monster, 300 * FPS).xp).toBe(5)
    let state = arena(300 * FPS)
    state.crops = [{ ...monster, x: 1000, y: 1000, spawnAt: 0 }]
    state = stepFarm(state, state.position).state
    expect(state.crops[0].xpStage).toBe(0)
    // An old drop still grants exactly its stored value after a stage change.
    state.crops = []
    state.loot = [{ id: 200, x: 50, y: 50, xp: 5, coins: 8 }]
    expect(stepFarm(state, state.position).state.xp).toBe(5)
  })

  it('refreshes experience stages for recycled normal monsters and elite slots', () => {
    let state = arena(120 * FPS)
    state.crops = [{ ...spawn(0), hp: 0, regrow: 0, elite: true }]
    let monster = stepFarm(state, state.position).state.crops[0]
    expect(monster).toMatchObject({ xpStage: 3, elite: false })
    expect(reward(monster, state.tick).xp).toBe(10)
    state = arena(45 * FPS)
    state.crops = [{ ...spawn(0), hp: 0, regrow: Infinity }]
    monster = stepFarm(state, state.position).state.crops[0]
    expect(monster).toMatchObject({ xpStage: 1, elite: true })
    expect(reward(monster, state.tick).xp).toBe(38)
    for (const timer of ['nextBoss', 'nextBass']) {
      state = arena(120 * FPS)
      state[timer] = state.tick
      expect(stepFarm(state, state.position).state.crops.find((enemy) => enemy.boss).xpStage).toBe(
        3,
      )
    }
  })

  // 36 full-length simulations: removing the hero's built-in pulse leaves more
  // monsters alive per frame, so each run costs noticeably more CPU.
  it('keeps all six builds playable across all daily modifiers without injected health or XP', () => {
    const days = modifierDays()
    expect(days).toHaveLength(6)
    const runs = days.flatMap((day) =>
      RECIPES.map(({ weapon }) => simulateFarm(day, weapon, true, 180)),
    )
    for (const run of runs) {
      expect(run.upgrades[0], `${run.modifier}/${run.focus}: first choice`).toBeLessThan(12)
      expect(run.evolutions.length, `${run.modifier}/${run.focus}: no evolution`).toBeGreaterThan(0)
      expect(run.evolutions[0].seconds).toBeLessThan(60)
      expect(run.seconds).toBeGreaterThan(30)
      expect(run.snapshots[30]).toBeGreaterThanOrEqual(6)
      expect(run.snapshots[30]).toBeLessThanOrEqual(18)
      if (run.snapshots[60]) expect(run.snapshots[60]).toBeGreaterThan(run.snapshots[30])
      if (run.snapshots[120]) expect(run.snapshots[120]).toBeGreaterThan(run.snapshots[60])
      if (run.snapshots[180]) expect(run.snapshots[180]).toBeGreaterThan(run.snapshots[120])
    }
    expect(runs.filter((run) => run.seconds >= 120).length).toBeGreaterThanOrEqual(24)
    // A simpler circular route also earns a complete first recipe and keeps
    // growing; the player need not dodge with frame-perfect reactions.
    for (const day of days) {
      const run = simulateFarm(day, 'echo', false, 120, true)
      expect(run.upgrades[0]).toBeLessThan(12)
      expect(run.evolutions[0]?.seconds).toBeLessThan(60)
      expect(run.seconds).toBe(120)
      expect(run.snapshots[120]).toBeGreaterThan(run.snapshots[60])
    }
  }, 300000)
})
