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
  permanentTierLabel,
  permanentTiers,
  validPermanentLevels,
  PERMANENT_TIER_LABELS,
  PERMANENT_UPGRADES,
  RECOVERY,
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

  it('reads every school as one contiguous tier ladder, ordered I to IV', () => {
    expect(PERMANENT_TIER_LABELS).toEqual(['I', 'II', 'III', 'IV'])
    expect(permanentTierLabel(1)).toBe('I')
    expect(permanentTierLabel(4)).toBe('IV')
    const ladders = {
      survival: ['舞台体魄', '舞台护甲', '生命回响', '守护音盾'],
      power: ['乐感力量', '演奏领悟'],
      movement: ['轻快步伐', '音符吸引'],
    }
    for (const [branch, names] of Object.entries(ladders)) {
      const items = permanentTiers(branch)
      expect(items.map((item) => item.name)).toEqual(names)
      expect(items.map((item) => item.tier)).toEqual(names.map((_, index) => index + 1))
      expect(items.every((item) => item.branch === branch)).toBe(true)
    }
    // Tier is display order only: every talent stays purchasable on its own.
    expect(PERMANENT_UPGRADES.every((item) => Number.isInteger(item.tier) && item.tier >= 1)).toBe(
      true,
    )
    expect(permanentTiers('survival').every((item) => permanentPrice(item.id, 0) !== null)).toBe(
      true,
    )
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

  it('heals at twenty seconds after a hit, then every twelve seconds, and resets on another hit', () => {
    let state = step(quiet({ regen: 1 }), true)
    expect(state.hp).toBe(88)
    while (state.tick < 320) state = step(state)
    expect(state.hp).toBe(88)
    state = step(state)
    expect(state.hp).toBe(89)
    for (let tick = 0; tick < 191; tick++) state = step(state)
    expect(state.hp).toBe(89)
    state = step(state)
    expect(state.hp).toBe(90)
    state = step(state, true)
    expect(state.hp).toBe(78)
    expect(state.regenTicks).toBe(0)
  })

  it('resets recovery on shield hits, ignores invulnerable collisions, and clears a full-heal timer', () => {
    let state = { ...quiet({ regen: 5 }), hp: 50, shields: 1, regenTicks: 191 }
    state = step(state, true)
    expect(state.hp).toBe(50)
    expect(state.shields).toBe(0)
    expect(state.regenTicks).toBe(0)
    const lastHit = state.lastHit
    state = step(state, true)
    expect(state.lastHit).toBe(lastHit)
    state = chooseTalent({ ...state, offered: ['heal'], regenTicks: 191 }, 'heal')
    expect(state.hp).toBe(state.maxHp)
    expect(state.regenTicks).toBe(0)
  })

  it.each([
    [1, 180],
    [2, 150],
    [3, 120],
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

  it('restarts the whole empty-shield timer on damage and never banks progress through combat', () => {
    let state = { ...quiet({ shield: 3 }), tick: 2000, shieldTicks: 1919 }
    state = step(state, true)
    expect(state.shieldTicks).toBe(0)
    expect(state.shields).toBe(0)
    state = step(state, true) // Ignored during invulnerability: recharge still advances.
    expect(state.shieldTicks).toBe(1)
    for (let tick = 0; tick < 1918; tick++) state = step(state)
    expect(state.shields).toBe(0)
    state = step(state)
    expect(state.shields).toBe(1)
  })

  it('lets pickups cancel a ready automatic shield without generating a second layer', () => {
    const pickup = {
      ...quiet({ shield: 3 }),
      shieldTicks: 1919,
      loot: [{ id: 1, x: 50, y: 76, xp: 0, coins: 0, shield: 1 }],
    }
    const result = stepFarm(pickup, pickup.position).state
    expect(result.shields).toBe(1)
    expect(result.shieldTicks).toBe(0)
  })

  it('never heals a lethal hit or accumulates recovery while full', () => {
    const dead = step(
      { ...quiet({ regen: 5, shield: 3 }), hp: 5, regenTicks: 191, shieldTicks: 1919 },
      true,
    )
    expect(dead.hp).toBe(0)
    expect(dead.shields).toBe(0)
    expect(stepFarm(dead, dead.position)).toBeNull()
    expect(step({ ...quiet({ regen: 5 }), regenTicks: 191 }).regenTicks).toBe(0)
  })

  it.each([1, 2, 3, 4, 5])(
    'keeps rank %s healing small, fractional and capped at maximum health',
    (regen) => {
      const amount = [1, 1.5, 2, 2.5, 3][regen - 1]
      const ready = { ...quiet({ regen }), hp: 50, regenTicks: 191 }
      expect(step(ready).hp).toBe(50 + amount)
      expect(step({ ...ready, hp: 99.75 }).hp).toBe(100)
      expect(permanentStats({ regen }).regen).toBe(amount)
      expect(RECOVERY.regenSeconds).toBe(12)
    },
  )

  it('cannot sustain continuous contact damage even with all defensive ranks and three stored shields', () => {
    let state = { ...quiet({ vitality: 12, armor: 6, regen: 5, shield: 3 }), shields: 3 }
    for (let tick = 0; tick < 20 * FPS && state.hp > 0; tick++) {
      state = step(state, tick % FPS === 0)
      expect(state.regenTicks).toBe(0)
      expect(state.shields).toBeLessThanOrEqual(3)
      expect(state.shieldTicks).toBeLessThan(FPS)
    }
    expect(state.hp).toBe(0)
    expect(state.shields).toBe(0)
  })
})
