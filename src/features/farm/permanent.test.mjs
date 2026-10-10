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
// 链上只能买到前缀，所以「刚好买到第 n 个某类节点」的存档就是买到它所在的位置。
const throughKind = (kind, nth = 1) =>
  PERMANENT_UPGRADES.filter((item) => item.kind === kind)[nth - 1].order + 1
const kindCount = (kind) => PERMANENT_UPGRADES.filter((item) => item.kind === kind).length
const full = () => prefix(PERMANENT_TOTAL_LEVELS)
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
      { 'step-201': 1 },
    ])
      expect(validPermanentLevels(invalid)).toBe(false)
    // 旧档的 key 在链上不存在：读回来是空链，空链本身仍是合法快照。
    expect(validPermanentLevels(normalizePermanentLevels({ shield: 3, vitality: 12 }))).toBe(true)
    expect(permanentLevelCount(normalizePermanentLevels({ shield: 3, vitality: 12 }))).toBe(0)
    // 旧档数值再大也不折算：链上没有这些 id，一律清空。
    expect(permanentLevelCount(normalizePermanentLevels({ shield: 999, power: 2 }))).toBe(0)
    expect(PERMANENT_UPGRADES).toHaveLength(200)
    expect(PERMANENT_TOTAL_LEVELS).toBe(200)
    // 每个节点都是单级：order 就是链上的位置。
    expect(PERMANENT_UPGRADES.every((item, index) => item.order === index && item.max === 1)).toBe(
      true,
    )
    // 价格是第 N 级 2000 × N，不手写 200 个数字。
    expect(PERMANENT_UPGRADES.every((item) => item.price === 2000 * (item.order + 1))).toBe(true)
    expect(permanentPrice('step-16', 0)).toBe(32000)
    expect(permanentPrice('step-200', 0)).toBe(400000)
    expect(permanentPrice('step-16', 1)).toBeNull()
    expect(permanentPrice('step-1', 1)).toBeNull()
    expect(permanentPrice('missing', 0)).toBeNull()
    // 单级节点：整条链的总价就是每个节点价格之和。
    const cost = PERMANENT_UPGRADES.reduce((sum, item) => sum + permanentPrice(item.id, 0), 0)
    expect(cost).toBe(40200000)
    expect(RECOVERY).toEqual({ safeSeconds: 8, regenSeconds: 12 })
  })

  it('interleaves the eight effects by quota instead of stacking them in blocks', () => {
    // 八类节点的配额：合计 200，生命最多、护盾与减伤/回血最少。
    expect(kindCount('vitality')).toBe(55)
    expect(kindCount('damage')).toBe(25)
    expect(kindCount('attraction')).toBe(30)
    expect(kindCount('speed')).toBe(27)
    expect(kindCount('xp')).toBe(32)
    expect(kindCount('armor')).toBe(8)
    expect(kindCount('regen')).toBe(8)
    expect(kindCount('shield')).toBe(15)
    expect(
      PERMANENT_UPGRADES.every((item) => item.kind && item.branch && item.icon && item.name),
    ).toBe(true)
    // 平滑加权轮询：同类节点不会相邻出现，链的前二十步就已经是混合的。
    for (let index = 1; index < PERMANENT_TOTAL_LEVELS; index += 1)
      expect(PERMANENT_UPGRADES[index].kind).not.toBe(PERMANENT_UPGRADES[index - 1].kind)
    expect(new Set(PERMANENT_UPGRADES.slice(0, 15).map((item) => item.kind)).size).toBe(8)
    // 护盾节点给出买下之后的间隔：170、160 … 30 秒。
    expect(
      PERMANENT_UPGRADES.filter((item) => item.kind === 'shield').map((item) => item.amount),
    ).toEqual([170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30])
    expect(PERMANENT_UPGRADES.filter((item) => item.kind === 'shield').at(-1).name).toBe(
      '补盾 30 秒',
    )
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
    }
    // 买满之前：已买过的节点保持解锁，后面的永远锁着。
    for (const count of [1, 100, PERMANENT_TOTAL_LEVELS - 1]) {
      const levels = prefix(count)
      for (const owned of PERMANENT_UPGRADES.slice(0, count))
        expect(permanentIsUnlocked(levels, owned.id)).toBe(true)
      for (const later of PERMANENT_UPGRADES.slice(count + 1))
        expect(permanentIsUnlocked(levels, later.id)).toBe(false)
    }
    expect(permanentNextStep(full())).toBeNull()
    expect(permanentIsUnlocked(full(), PERMANENT_UPGRADES.at(-1).id)).toBe(true)
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
    // 前 5 个节点是生命、经验、拾取、移速、伤害各一个。
    expect(permanentStats(prefix(5))).toEqual({
      maxHp: 101,
      damage: 1,
      speed: 1,
      attraction: 2,
      xp: 1,
      armor: 0,
      regen: 0,
      shieldSeconds: 0,
    })
    // 前 12 个再加生命 ×2、护盾 170 秒、减伤 1、经验 +1、拾取 +2。
    expect(permanentStats(prefix(12))).toEqual({
      maxHp: 103,
      damage: 1,
      speed: 2,
      attraction: 4,
      xp: 2,
      armor: 1,
      regen: 0,
      shieldSeconds: 170,
    })
    // 护盾节点不累加：取已购最后一个（间隔最小）的数值。
    expect(permanentStats(prefix(throughKind('shield', 1))).shieldSeconds).toBe(170)
    expect(permanentStats(prefix(throughKind('shield', 2))).shieldSeconds).toBe(160)
    // 满链：生命 155、伤害 25、拾取 60、移速 27、经验 32、减伤 8、回血 8、补盾 30 秒。
    expect(permanentStats(full())).toEqual({
      maxHp: 155,
      damage: 25,
      speed: 27,
      attraction: 60,
      xp: 32,
      armor: 8,
      regen: 8,
      shieldSeconds: 30,
    })
  })

  it('clears a legacy multi-level save instead of converting it into chain steps', () => {
    // 旧档不再折算：这些 key 在链上不存在，读回来全 0，强化清空。
    const legacy = {
      vitality: 12,
      power: 15,
      armor: 12,
      regen: 5,
      shield: 3,
      wisdom: 9,
      stride: 6,
      magnet: 10,
    }
    const cleared = normalizePermanentLevels(legacy)
    expect(Object.keys(cleared)).toHaveLength(PERMANENT_TOTAL_LEVELS)
    expect(Object.values(cleared).every((level) => level === 0)).toBe(true)
    expect(permanentLevelCount(cleared)).toBe(0)
    // 清空后从头开始：下一个可买的仍然是第一个节点。
    expect(permanentNextStep(cleared)).toBe('step-1')
    expect(permanentIsUnlocked(cleared, 'step-1')).toBe(true)
    expect(permanentIsUnlocked(cleared, 'step-2')).toBe(false)
    expect(permanentStats(cleared)).toEqual(permanentStats())
    // 只有部分旧项、或带负数的旧档同样不凭空产出节点。
    expect(
      permanentLevelCount(normalizePermanentLevels({ vitality: 6, power: 9, shield: 1 })),
    ).toBe(0)
    expect(permanentLevelCount(normalizePermanentLevels({ regen: 4 }))).toBe(0)
    expect(permanentLevelCount(normalizePermanentLevels({ vitality: -1, regen: 2 }))).toBe(0)
    // 链上的 id 原样保留：正常存档（每项 0/1）不受影响。
    const kept = normalizePermanentLevels({ 'step-1': 1, 'step-9': 1 })
    expect(permanentLevelCount(kept)).toBe(2)
    expect(kept['step-9']).toBe(1)
    expect(kept['step-2']).toBe(0)
  })

  it('freezes starting attributes and makes one speed step effective', () => {
    const levels = prefix(throughKind('speed', 4)) // 买到第 4 个移速节点
    const stats = permanentStats(levels)
    const state = quiet(levels)
    expect(Object.isFrozen(state.permanent)).toBe(true)
    expect(state.hp).toBe(stats.maxHp)
    expect(state.maxHp).toBe(stats.maxHp)
    // 移速是每秒距离单位：四个移速节点各 +1，共 +4。
    expect(stats.speed).toBe(4)
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
      const grown = play(full())
      expect(bare.dealt).toBeGreaterThan(0)
      expect(bare.hits).toBeGreaterThan(0)
      expect(grown.hits).toBe(bare.hits)
      // 固定数值加成：每次命中只加一次 stats.damage，不跟着暴击和局内倍率一起放大。
      // 每帧的伤害会四舍五入到两位小数，误差按命中次数放宽。
      const bonus = permanentStats(full()).damage
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
    // 经验 +1 ×3：掉落生成时叠加固定值，与金币无关。
    expect(attack(prefix(throughKind('xp', 3))).xp).toBe(attack({}).xp + 3)
    expect(attack(prefix(throughKind('xp', 3))).coins).toBe(attack({}).coins)
    const pull = (levels) => {
      const state = quiet(levels)
      state.loot = [{ id: 1, x: 68, y: 76, xp: 1, coins: 1 }]
      return stepFarm(state, state.position).state.loot[0].x
    }
    // 拾取 +2 ×2 = 半径 19：基础半径 15 够不着 18，加上 4 才够得着。
    expect(permanentStats(prefix(throughKind('attraction', 2))).attraction).toBe(4)
    expect(pull({})).toBe(68)
    expect(pull(prefix(throughKind('attraction', 2)))).toBeLessThan(68)
    // 减伤是每次受击固定扣减的点数，不是百分比。
    const armored = prefix(throughKind('armor', 1))
    expect(permanentStats(armored).armor).toBe(1)
    expect(step(quiet(armored), true).hp).toBe(permanentStats(armored).maxHp - 11)
  })

  it('heals at twenty seconds after a hit, then every twelve seconds, and resets on another hit', () => {
    // 买到第 1 个回血节点：每次回复 1 点，周期仍是十二秒。
    const levels = prefix(throughKind('regen', 1))
    const taken = 12 - permanentStats(levels).armor
    const wounded = permanentStats(levels).maxHp - taken
    let state = step(quiet(levels), true)
    expect(state.hp).toBe(wounded)
    while (state.tick < FPS * (RECOVERY.safeSeconds + RECOVERY.regenSeconds)) state = step(state)
    expect(state.hp).toBe(wounded)
    state = step(state)
    expect(state.hp).toBe(wounded + 1)
    for (let tick = 0; tick < FPS * RECOVERY.regenSeconds - 1; tick++) state = step(state)
    expect(state.hp).toBe(wounded + 1)
    state = step(state)
    expect(state.hp).toBe(wounded + 2)
    state = step(state, true)
    expect(state.hp).toBe(wounded + 2 - taken)
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
    [1, 170],
    [3, 150],
    [15, 30],
  ])('regenerates only one empty shield after %s shield steps', (nth, seconds) => {
    const count = throughKind('shield', nth)
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
    const ticks = FPS * permanentStats(full()).shieldSeconds
    let state = { ...quiet(full()), tick: 2000, shieldTicks: ticks - 1 }
    state = step(state, true)
    expect(state.shieldTicks).toBe(0)
    expect(state.shields).toBe(0)
    state = step(state, true) // Ignored during invulnerability: recharge still advances.
    expect(state.shieldTicks).toBe(1)
    for (let tick = 0; tick < ticks - 2; tick++) state = step(state)
    expect(state.shields).toBe(0)
    state = step(state)
    expect(state.shields).toBe(1)
  })

  it('lets pickups cancel a ready automatic shield without generating a second layer', () => {
    const pickup = {
      ...quiet(full()),
      shieldTicks: FPS * permanentStats(full()).shieldSeconds - 1,
      loot: [{ id: 1, x: 50, y: 76, xp: 0, coins: 0, shield: 1 }],
    }
    const result = stepFarm(pickup, pickup.position).state
    expect(result.shields).toBe(1)
    expect(result.shieldTicks).toBe(0)
  })

  it('never heals a lethal hit or accumulates recovery while full', () => {
    // 满链减伤 8：一次 12 点伤害还剩 4 点，3 点血照样被打空。
    const lethal = { ...quiet(full()), hp: 3, regenTicks: FPS * RECOVERY.regenSeconds - 1 }
    const dead = step(
      { ...lethal, shieldTicks: FPS * permanentStats(full()).shieldSeconds - 1 },
      true,
    )
    expect(dead.hp).toBe(0)
    expect(dead.shields).toBe(0)
    expect(stepFarm(dead, dead.position)).toBeNull()
    expect(step({ ...quiet(full()), regenTicks: FPS * RECOVERY.regenSeconds - 1 }).regenTicks).toBe(
      0,
    )
  })

  it.each([1, 2])('keeps %s heal step small, flat and capped at maximum health', (count) => {
    const levels = prefix(throughKind('regen', count))
    expect(permanentStats(levels).regen).toBe(count)
    const ready = { ...quiet(levels), hp: 50, regenTicks: FPS * RECOVERY.regenSeconds - 1 }
    expect(step(ready).hp).toBe(50 + count)
    expect(step({ ...ready, hp: ready.maxHp - 0.25 }).hp).toBe(ready.maxHp)
    expect(RECOVERY.regenSeconds).toBe(12)
  })

  it('cannot sustain continuous contact damage even with every defensive step and three stored shields', () => {
    let state = { ...quiet(full()), shields: 3 }
    // 满链把每次受击压到 4 点，但仍然顶不住：一分钟的贴身伤害足以打空 155 点血。
    for (let tick = 0; tick < 60 * FPS && state.hp > 0; tick++) {
      state = step(state, tick % FPS === 0)
      expect(state.regenTicks).toBe(0)
      expect(state.shields).toBeLessThanOrEqual(3)
      expect(state.shieldTicks).toBeLessThan(FPS)
    }
    expect(state.hp).toBe(0)
    expect(state.shields).toBe(0)
  })
})
