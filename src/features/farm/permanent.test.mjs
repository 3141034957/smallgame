import { describe, expect, it } from 'vitest'
import {
  createFarm,
  stepFarm,
  chooseTalent,
  farmMoveStep,
  clampPoint,
  FPS,
  MOVE_STEP,
  RECIPES,
} from './rules.mjs'
import {
  legacyStepCount,
  normalizePermanentLevels,
  permanentIsUnlocked,
  permanentLevelCount,
  permanentNextStep,
  permanentPrice,
  permanentStats,
  validPermanentLevels,
  PERMANENT_TOTAL_LEVELS,
  PERMANENT_UPGRADES,
  RECOVERY,
} from './permanent.mjs'

const day = '2026-10-06'
// 永久强化是一条链，只能按顺序解锁，所以任何合法档案都是链的某个前缀。
const prefix = (count) =>
  Object.fromEntries(PERMANENT_UPGRADES.map((item, index) => [item.id, index < count ? 1 : 0]))
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
  it('bounds the whole chain and rejects malformed replay snapshots', () => {
    expect(Object.values(normalizePermanentLevels()).every((level) => level === 0)).toBe(true)
    for (const invalid of [
      null,
      [],
      { 'step-1': 2 },
      { 'step-1': -1 },
      { 'step-1': 1.2 },
      { mystery: 1 },
      { 'step-30': 1 },
    ])
      expect(validPermanentLevels(invalid)).toBe(false)
    // 旧档（某项 > 1 级）会被折算成链前缀，折算结果本身是合法快照。
    expect(validPermanentLevels(normalizePermanentLevels({ shield: 3, vitality: 12 }))).toBe(true)
    expect(permanentLevelCount(normalizePermanentLevels({ shield: 999, power: 2 }))).toBe(
      PERMANENT_TOTAL_LEVELS,
    )
    expect(PERMANENT_UPGRADES).toHaveLength(29)
    // 每个节点都是单级：order 就是链上的位置。
    expect(PERMANENT_UPGRADES.every((item, index) => item.order === index && item.max === 1)).toBe(
      true,
    )
    expect(permanentPrice('step-16', 0)).toBe(21900)
    expect(permanentPrice('step-16', 1)).toBeNull()
    expect(permanentPrice('step-1', 1)).toBeNull()
    expect(permanentPrice('missing', 0)).toBeNull()
    // 单级节点：整条链的总价就是每个节点价格之和。
    const cost = PERMANENT_UPGRADES.reduce((sum, item) => sum + permanentPrice(item.id, 0), 0)
    expect(cost).toBe(712000)
    expect(RECOVERY).toEqual({ safeSeconds: 8, regenSeconds: 12, shieldSeconds: [180, 150, 120] })
  })

  it('opens the chain one step at a time and never unlocks a step out of order', () => {
    expect(permanentNextStep()).toBe('step-1')
    expect(permanentIsUnlocked({}, 'step-1')).toBe(true)
    // 跳步的节点一律未解锁：只有「下一个」可以买。
    expect(permanentIsUnlocked({}, 'step-2')).toBe(false)
    expect(permanentIsUnlocked({}, PERMANENT_UPGRADES.at(-1).id)).toBe(false)
    for (let count = 0; count < PERMANENT_TOTAL_LEVELS; count++) {
      const levels = prefix(count)
      expect(permanentNextStep(levels)).toBe(PERMANENT_UPGRADES[count].id)
      expect(permanentIsUnlocked(levels, PERMANENT_UPGRADES[count].id)).toBe(true)
      // 已买过的节点保持解锁，否则重买会被拒绝；后面的永远锁着。
      for (const owned of PERMANENT_UPGRADES.slice(0, count))
        expect(permanentIsUnlocked(levels, owned.id)).toBe(true)
      for (const later of PERMANENT_UPGRADES.slice(count + 1))
        expect(permanentIsUnlocked(levels, later.id)).toBe(false)
    }
    expect(permanentNextStep(prefix(PERMANENT_TOTAL_LEVELS))).toBeNull()
    expect(permanentIsUnlocked(prefix(PERMANENT_TOTAL_LEVELS), 'step-29')).toBe(true)
  })

  it('adds every step as a flat amount, with no percentages anywhere', () => {
    expect(permanentStats()).toEqual({
      maxHp: 100,
      damage: 0,
      speed: 0,
      attraction: 0,
      xp: 0,
      armor: 0,
      regen: 0,
      shieldSeconds: 0,
    })
    // 前 5 个节点：生命 +10 ×2、伤害 +1、拾取 +8、移速 +2。
    expect(permanentStats(prefix(5))).toEqual({
      maxHp: 120,
      damage: 1,
      speed: 2,
      attraction: 8,
      xp: 0,
      armor: 0,
      regen: 0,
      shieldSeconds: 0,
    })
    // 前 10 个再加生命 +10、经验 +2、减伤 1、伤害 +1、回血 +1。
    expect(permanentStats(prefix(10))).toEqual({
      maxHp: 130,
      damage: 2,
      speed: 2,
      attraction: 8,
      xp: 2,
      armor: 1,
      regen: 1,
      shieldSeconds: 0,
    })
    // 护盾节点不累加：取链上最后一个已买的数值。
    expect(permanentStats(prefix(16)).shieldSeconds).toBe(180)
    expect(permanentStats(prefix(24)).shieldSeconds).toBe(150)
    expect(permanentStats(prefix(29))).toEqual({
      maxHp: 160,
      damage: 5,
      speed: 6,
      attraction: 32,
      xp: 6,
      armor: 3,
      regen: 2,
      shieldSeconds: 120,
    })
  })

  it('migrates a legacy multi-level save into an unbroken prefix of the chain', () => {
    // vitality 1/2 + power 1/3：12 → 6，15 → 5，共 11 个节点。
    expect(legacyStepCount({ vitality: 12, power: 15 })).toBe(11)
    const migrated = normalizePermanentLevels({ vitality: 12, power: 15 })
    expect(permanentLevelCount(migrated)).toBe(11)
    expect(migrated['step-11']).toBe(1)
    expect(migrated['step-12']).toBe(0)
    expect(permanentNextStep(migrated)).toBe('step-12')
    // 全部旧项加起来超过链长时截断到 29。
    expect(
      legacyStepCount({
        vitality: 12,
        power: 15,
        armor: 12,
        regen: 5,
        shield: 3,
        wisdom: 9,
        stride: 6,
        magnet: 10,
      }),
    ).toBe(PERMANENT_TOTAL_LEVELS)
    expect(legacyStepCount({ vitality: 6, power: 9, shield: 1 })).toBe(7)
    expect(legacyStepCount({ regen: 4 })).toBe(2)
    // 负数只会被截断，不会凭空产出节点。
    expect(legacyStepCount({ vitality: -1, regen: 2 })).toBe(0)
    // 非旧格式（每项 0/1）原样保留，不做折算。
    const kept = normalizePermanentLevels({ 'step-1': 1, 'step-9': 1 })
    expect(permanentLevelCount(kept)).toBe(2)
    expect(kept['step-9']).toBe(1)
    expect(kept['step-2']).toBe(0)
  })

  it('freezes starting attributes and makes one speed step effective', () => {
    const levels = prefix(22) // 6 个生命节点 → 160
    const state = quiet(levels)
    expect(Object.isFrozen(state.permanent)).toBe(true)
    expect(state.hp).toBe(160)
    expect(state.maxHp).toBe(160)
    // 移速是每秒距离单位：前 22 个节点里有 2 个（+2 各），共 +4。
    expect(permanentStats(levels).speed).toBe(4)
    expect(farmMoveStep(state)).toBeCloseTo(MOVE_STEP + 4 / FPS)
    const point = clampPoint(state.position, [100, state.position[1]], farmMoveStep(state))
    expect(point[0] - state.position[0]).toBeCloseTo(MOVE_STEP + 4 / FPS)
    expect(stepFarm(state, point)).not.toBeNull()
    expect(stepFarm(state, [point[0] + 0.1, point[1]])).toBeNull()
    expect(stepFarm(state, [NaN, point[1]])).toBeNull()
    expect(stepFarm(quiet(), point)).toBeNull()
  })

  it.each(RECIPES.map((item) => [item.weapon, item.chip]))(
    'adds the flat damage step to every hit of %s without multiplying it',
    (weapon, chip) => {
      const play = (levels) => {
        let state = quiet(levels)
        state.gear[weapon] = 5
        state.gear[chip] = 5
        // Nothing attacks on the player's behalf any more, so the probe has to
        // stand where the instrument reaches: the two ring weapons orbit far
        // out, everything else covers the player's own tile.
        const reach = { orbit: (13 + 10) / 0.84, deck: (24 + 15) / 0.84 }[weapon] ?? 3
        state.crops = [
          {
            id: 1,
            x: state.position[0] + reach,
            y: state.position[1],
            hp: 1000000,
            maxHp: 1000000,
            kind: 0,
            regrow: -1,
            boss: false,
          },
        ]
        let hits = 0
        for (let tick = 0; tick < 96; tick++) {
          const result = stepFarm(state, state.position)
          state = result.state
          hits += result.events.filter((event) => event.kind === 'hit').length
        }
        return { dealt: 1000000 - state.crops[0].hp, hits }
      }
      const bare = play()
      const grown = play(prefix(29))
      expect(bare.dealt).toBeGreaterThan(0)
      expect(bare.hits).toBeGreaterThan(0)
      expect(grown.hits).toBe(bare.hits)
      // 固定数值加成：每次命中只加一次 stats.damage，不跟着暴击和局内倍率一起放大。
      // 每帧的伤害会四舍五入到两位小数，误差按命中次数放宽。
      const bonus = permanentStats(prefix(29)).damage
      expect(Math.abs(grown.dealt - bare.dealt - bonus * grown.hits)).toBeLessThan(
        0.01 * grown.hits + 0.01,
      )
    },
  )

  it('adds experience on top of the drop and widens attraction by a flat radius', () => {
    const attack = (levels) => {
      const state = quiet(levels)
      state.gear.drum = 5
      state.crops = [{ id: 1, x: 50, y: 76, hp: 1, maxHp: 1, kind: 0, regrow: -1, boss: false }]
      return stepFarm(state, state.position).state
    }
    expect(attack({}).xp).toBeGreaterThan(0)
    // 经验 +2 ×3：掉落生成时叠加固定值，与金币无关。
    expect(attack(prefix(25)).xp).toBe(attack({}).xp + 6)
    expect(attack(prefix(25)).coins).toBe(attack({}).coins)
    const pull = (levels) => {
      const state = quiet(levels)
      state.loot = [{ id: 1, x: 68, y: 76, xp: 1, coins: 1 }]
      return stepFarm(state, state.position).state.loot[0].x
    }
    expect(permanentStats(prefix(3)).attraction).toBe(8)
    expect(pull({})).toBe(68) // 基础半径 15 够不着 15.12
    expect(pull(prefix(3))).toBeLessThan(68)
    // 减伤是每次受击固定扣减的点数，不是百分比。
    expect(permanentStats(prefix(7)).armor).toBe(1)
    expect(step(quiet(prefix(7)), true).hp).toBe(109)
  })

  it('heals at twenty seconds after a hit, then every twelve seconds, and resets on another hit', () => {
    let state = step(quiet(prefix(10)), true)
    expect(state.hp).toBe(119)
    while (state.tick < 320) state = step(state)
    expect(state.hp).toBe(119)
    state = step(state)
    expect(state.hp).toBe(120)
    for (let tick = 0; tick < 191; tick++) state = step(state)
    expect(state.hp).toBe(120)
    state = step(state)
    expect(state.hp).toBe(121)
    state = step(state, true)
    expect(state.hp).toBe(110)
    expect(state.regenTicks).toBe(0)
  })

  it('resets recovery on shield hits, ignores invulnerable collisions, and clears a full-heal timer', () => {
    let state = { ...quiet(prefix(21)), hp: 50, shields: 1, regenTicks: 191 }
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
    [16, 180],
    [24, 150],
    [29, 120],
  ])('regenerates only one empty shield after %s chain steps', (count, seconds) => {
    expect(permanentStats(prefix(count)).shieldSeconds).toBe(seconds)
    let state = quiet(prefix(count))
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
    let state = { ...quiet(prefix(29)), tick: 2000, shieldTicks: 1919 }
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
      ...quiet(prefix(29)),
      shieldTicks: 1919,
      loot: [{ id: 1, x: 50, y: 76, xp: 0, coins: 0, shield: 1 }],
    }
    const result = stepFarm(pickup, pickup.position).state
    expect(result.shields).toBe(1)
    expect(result.shieldTicks).toBe(0)
  })

  it('never heals a lethal hit or accumulates recovery while full', () => {
    const dead = step({ ...quiet(prefix(29)), hp: 5, regenTicks: 191, shieldTicks: 1919 }, true)
    expect(dead.hp).toBe(0)
    expect(dead.shields).toBe(0)
    expect(stepFarm(dead, dead.position)).toBeNull()
    expect(step({ ...quiet(prefix(21)), regenTicks: 191 }).regenTicks).toBe(0)
  })

  it.each([1, 2])('keeps %s heal step small, flat and capped at maximum health', (count) => {
    const levels = prefix(count === 1 ? 10 : 21)
    expect(permanentStats(levels).regen).toBe(count)
    const ready = { ...quiet(levels), hp: 50, regenTicks: 191 }
    expect(step(ready).hp).toBe(50 + count)
    expect(step({ ...ready, hp: ready.maxHp - 0.25 }).hp).toBe(ready.maxHp)
    expect(RECOVERY.regenSeconds).toBe(12)
  })

  it('cannot sustain continuous contact damage even with every defensive step and three stored shields', () => {
    let state = { ...quiet(prefix(29)), shields: 3 }
    for (let tick = 0; tick < 24 * FPS && state.hp > 0; tick++) {
      state = step(state, tick % FPS === 0)
      expect(state.regenTicks).toBe(0)
      expect(state.shields).toBeLessThanOrEqual(3)
      expect(state.shieldTicks).toBeLessThan(FPS)
    }
    expect(state.hp).toBe(0)
    expect(state.shields).toBe(0)
  })
})
