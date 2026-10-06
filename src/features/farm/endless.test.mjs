import { describe, expect, it } from 'vitest'
import {
  FPS,
  MAX_BOSSES,
  MAX_GEAR_LEVEL,
  THRESHOLDS,
  UPGRADE_STEPS,
  chooseTalent,
  createFarm,
  evolved,
  finishFarm,
  orbitPositions,
  stepFarm,
} from './rules.mjs'

const day = '2026-10-04'
const arena = (tick) => ({
  ...createFarm(day),
  tick,
  crops: [],
  nextWave: Infinity,
  nextBoss: Infinity,
  lastPulse: tick,
})

describe('endless survival', () => {
  it('continues beyond thirty seconds, one minute and one hour with no timer-based finish', () => {
    for (const seconds of [30, 60, 3600]) {
      let state = arena(seconds * FPS - 1)
      for (let index = 0; index < 3; index++) state = stepFarm(state, state.position).state
      expect(state.tick).toBe(seconds * FPS + 2)
      expect(state.hp).toBe(100)
      expect(finishFarm(state, [], [], [])).toBeNull()
    }
  })

  it('fills a whole loadout after the old time limit, without over-leveling or empty upgrade locks', () => {
    let state = arena(2 * 60 * FPS)
    state.xp = THRESHOLDS.at(-1)
    state = stepFarm(state, state.position).state
    // Finish all gear upgrades without consuming optional healing cards.
    for (let index = 0; index < UPGRADE_STEPS; index++) {
      expect(state.offered.length).toBeGreaterThan(0)
      expect(state.offered.every((id) => id === 'heal' || state.gear[id] < MAX_GEAR_LEVEL)).toBe(
        true,
      )
      state = chooseTalent(
        state,
        state.offered.find((id) => id !== 'heal'),
      )
    }
    expect(state.level).toBe(UPGRADE_STEPS)
    expect(state.offered).toEqual([])
    expect(evolved(state.gear).length).toBeGreaterThan(0)
    expect(stepFarm(state, state.position)?.state.tick).toBe(state.tick + 1)
  })

  it('keeps bosses spawning after a minute and recycles dead bosses while bounding active entities', () => {
    let state = arena(60 * FPS)
    for (let index = 0; index < 20; index++) {
      state.nextBoss = state.tick
      state = stepFarm(state, state.position).state
    }
    expect(state.crops.filter((enemy) => enemy.boss)).toHaveLength(MAX_BOSSES)
    const removedId = state.crops[0].id
    state.crops[0].hp = 0
    state.nextBoss = state.tick
    state = stepFarm(state, state.position).state
    expect(state.crops).toHaveLength(MAX_BOSSES)
    expect(state.crops.some((enemy) => enemy.id === removedId)).toBe(false)
    expect(state.harvested).toBe(0)
    expect(state.score).toBe(0)
    state.nextWave = state.tick
    expect(stepFarm(state, state.position).state.crops.length).toBeGreaterThan(MAX_BOSSES)
  })

  it('lets the guitarist orbiting notes swallow ranged shots before they land', () => {
    const fire = (orbit) => {
      let state = arena(10 * FPS)
      state.gear = { ...state.gear, orbit }
      state = stepFarm(state, state.position).state
      const target = orbit ? orbitPositions(state)[0] : [state.position[0] + 20, state.position[1]]
      state.shots = [
        { id: 900, x: target[0], y: target[1], dx: 0, dy: 0, expires: state.tick + FPS * 5 },
      ]
      return stepFarm(state, state.position)
    }
    const guarded = fire(2)
    expect(guarded.events.some((event) => event.kind === 'block')).toBe(true)
    expect(guarded.state.blocks).toBe(1)
    expect(guarded.state.shots).toHaveLength(0)
    expect(guarded.state.hp).toBe(100)
    const bare = fire(0)
    expect(bare.events.some((event) => event.kind === 'block')).toBe(false)
    expect(bare.state.blocks).toBe(0)
    expect(bare.state.shots).toHaveLength(1)
  })

  it('increases late enemy health while keeping even hour-long pursuit speeds bounded', () => {
    const spawn = (seconds) => {
      const state = arena(seconds * FPS)
      state.nextWave = state.tick
      return stepFarm(state, state.position).state
    }
    const minute = spawn(60),
      late = spawn(240)
    expect(late.crops[0].maxHp).toBeGreaterThan(minute.crops[0].maxHp)
    const state = arena(3600 * FPS)
    state.crops = [{ id: 1, kind: 1, x: 10, y: 76, hp: 100, maxHp: 100, regrow: -1, boss: false }]
    const moved = stepFarm(state, state.position).state.crops[0]
    expect(moved.x).toBeGreaterThan(10)
    expect(moved.x - 10).toBeLessThan(3)
  })
})
