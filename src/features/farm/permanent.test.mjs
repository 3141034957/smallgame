import { describe, expect, it } from 'vitest'
import {
  createFarm,
  stepFarm,
  chooseTalent,
  farmMoveStep,
  clampPoint,
  FPS,
  RECIPES,
} from './rules.mjs'
import {
  normalizePermanentLevels,
  permanentPrice,
  permanentStats,
  validPermanentLevels,
  PERMANENT_UPGRADES,
} from './permanent.mjs'

const day = '2026-10-06'
function quiet(levels = {}) {
  return {
    ...createFarm(day, levels),
    offered: [],
    crops: [],
    nextWave: Infinity,
    nextBoss: Infinity,
    nextBass: Infinity,
    hurtUntil: 0,
  }
}
function step(state, hit = false) {
  return stepFarm(
    {
      ...state,
      crops: [],
      loot: [],
      dangers: [],
      shots: hit
        ? [
            {
              id: 1,
              x: state.position[0],
              y: state.position[1],
              dx: 0,
              dy: 0,
              damage: 12,
              expires: state.tick + 2,
            },
          ]
        : [],
    },
    state.position,
  ).state
}

describe('permanent growth rules', () => {
  it('bounds all eight independent upgrades and rejects malformed replay snapshots', () => {
    expect(Object.values(normalizePermanentLevels()).every((level) => level === 0)).toBe(true)
    for (const invalid of [null, [], { power: 16 }, { stride: -1 }, { regen: 1.2 }, { mystery: 1 }])
      expect(validPermanentLevels(invalid)).toBe(false)
    expect(validPermanentLevels({ shield: 3, vitality: 12 })).toBe(true)
    expect(normalizePermanentLevels({ shield: 999, power: 2 }).shield).toBe(0)
    expect(permanentPrice('shield', 0)).toBe(18000)
    expect(permanentPrice('shield', 3)).toBeNull()
    expect(permanentPrice('vitality', 1)).toBe(2500)
    const cost = PERMANENT_UPGRADES.reduce(
      (sum, item) =>
        sum +
        Array.from({ length: item.max }, (_, level) => permanentPrice(item.id, level)).reduce(
          (a, b) => a + b,
          0,
        ),
      0,
    )
    expect(cost).toBe(1824600)
  })

  it('freezes starting attributes and makes even one speed rank effective', () => {
    const levels = { vitality: 12, stride: 1 }
    const state = quiet(levels)
    levels.vitality = 0
    expect(state.hp).toBe(160)
    expect(state.maxHp).toBe(160)
    const point = clampPoint(state.position, [100, state.position[1]], farmMoveStep(state))
    expect(point[0] - state.position[0]).toBeCloseTo(3.03)
    expect(stepFarm(state, point)).not.toBeNull()
    expect(stepFarm(state, [point[0] + 0.1, point[1]])).toBeNull()
    expect(stepFarm(state, [NaN, point[1]])).toBeNull()
    expect(stepFarm(quiet(), point)).toBeNull()
  })

  it.each(RECIPES.map((item) => [item.weapon, item.chip]))(
    'applies damage growth to %s and its evolution without multiplying twice',
    (weapon, chip) => {
      const play = (power) => {
        let state = quiet({ power })
        state.gear[weapon] = 5
        state.gear[chip] = 5
        state.crops = [
          { id: 1, x: 53, y: 76, hp: 1000000, maxHp: 1000000, kind: 0, regrow: -1, boss: false },
        ]
        for (let tick = 0; tick < 96; tick++) state = stepFarm(state, state.position).state
        return 1000000 - state.crops[0].hp
      }
      const base = play(0)
      expect(base).toBeGreaterThan(0)
      expect(play(15)).toBeCloseTo(base * 1.3, 1)
    },
  )

  it('adds experience independently of coin rewards and increases attraction', () => {
    const collect = (wisdom) => {
      const state = quiet({ wisdom })
      state.loot = [{ id: 1, x: 50, y: 76, xp: 5, coins: 8 }]
      return stepFarm(state, state.position).state
    }
    expect(collect(10).xp).toBe(5) // Growth is applied at drop generation, not collection.
    const attack = (wisdom) => {
      const state = quiet({ wisdom })
      state.crops = [{ id: 1, x: 50, y: 76, hp: 1, maxHp: 1, kind: 0, regrow: -1, boss: false }]
      return stepFarm(state, state.position).state
    }
    expect(attack(10).xp).toBeCloseTo(attack(0).xp * 1.2)
    expect(attack(10).coins).toBe(attack(0).coins)
    const pull = (magnet) => {
      const state = quiet({ magnet })
      state.loot = [{ id: 1, x: 68, y: 76, xp: 1, coins: 1 }]
      return stepFarm(state, state.position).state.loot[0].x
    }
    expect(pull(0)).toBe(68)
    expect(pull(10)).toBeLessThan(68)
    expect(permanentStats({ armor: 6 }).damageTaken).toBeCloseTo(0.88)
    expect(step(quiet({ armor: 6 }), true).hp).toBe(89.44)
  })

  it('heals at ten seconds after a hit, then every six seconds, and resets on another hit', () => {
    let state = step(quiet({ regen: 1 }), true)
    expect(state.hp).toBe(88)
    while (state.tick < 160) state = step(state)
    expect(state.hp).toBe(88)
    state = step(state)
    expect(state.hp).toBe(90)
    for (let tick = 0; tick < 95; tick++) state = step(state)
    expect(state.hp).toBe(90)
    state = step(state)
    expect(state.hp).toBe(92)
    state = step(state, true)
    expect(state.hp).toBe(80)
    expect(state.regenTicks).toBe(0)
  })

  it('resets recovery on shield hits, ignores invulnerable collisions, and clears a full-heal timer', () => {
    let state = { ...quiet({ regen: 5 }), hp: 50, shields: 1, regenTicks: 95 }
    state = step(state, true)
    expect(state.hp).toBe(50)
    expect(state.shields).toBe(0)
    expect(state.regenTicks).toBe(0)
    const lastHit = state.lastHit
    state = step(state, true)
    expect(state.lastHit).toBe(lastHit)
    state = chooseTalent({ ...state, offered: ['heal'], regenTicks: 95 }, 'heal')
    expect(state.hp).toBe(state.maxHp)
    expect(state.regenTicks).toBe(0)
  })

  it.each([
    [1, 90],
    [2, 75],
    [3, 60],
  ])('regenerates only one empty shield at rank %s', (shield, seconds) => {
    let state = quiet({ shield })
    for (let tick = 0; tick < seconds * FPS - 1; tick++) state = step(state)
    expect(state.shields).toBe(0)
    state = step(state)
    expect(state.shields).toBe(1)
    for (let tick = 0; tick < seconds * FPS + 1; tick++) state = step(state)
    expect(state.shields).toBe(1)
    expect(state.shieldTicks).toBe(0)
    state = step(state, true)
    expect(state.shields).toBe(0)
    expect(state.shieldTicks).toBe(0)
  })

  it('waits for eight safe seconds and lets pickups cancel a ready automatic shield', () => {
    let state = { ...quiet({ shield: 3 }), tick: 960, shieldTicks: 960, lastHit: 900 }
    state = step(state)
    expect(state.shields).toBe(0)
    while (state.tick < 1028) state = step(state)
    state = step(state)
    expect(state.shields).toBe(1)
    const pickup = {
      ...quiet({ shield: 3 }),
      shieldTicks: 959,
      loot: [{ id: 1, x: 50, y: 76, xp: 0, coins: 0, shield: 1 }],
    }
    const result = stepFarm(pickup, pickup.position).state
    expect(result.shields).toBe(1)
    expect(result.shieldTicks).toBe(0)
  })

  it('never heals a lethal hit or accumulates recovery while full', () => {
    const dead = step(
      { ...quiet({ regen: 5, shield: 3 }), hp: 5, regenTicks: 95, shieldTicks: 959 },
      true,
    )
    expect(dead.hp).toBe(0)
    expect(dead.shields).toBe(0)
    expect(stepFarm(dead, dead.position)).toBeNull()
    expect(step({ ...quiet({ regen: 5 }), regenTicks: 95 }).regenTicks).toBe(0)
  })
})
