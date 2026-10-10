import { describe, it, expect } from 'vitest'
import {
  createFarm,
  stepFarm,
  clampPoint,
  evolved,
  ECHO_INTERVAL,
  ECHO_SECONDS,
  FPS,
  HEAL_COOLDOWN,
  HEAL_TTL,
  MAX_GEAR_LEVEL,
  MAX_STAT_LEVEL,
  MOVE_STEP,
  SHIELD_COOLDOWN,
  SHIELD_LIMIT,
} from './rules.mjs'
import { PERMANENT_UPGRADES } from './permanent.mjs'
const enemy = (id, kind, x, y, boss = false) => ({
  id,
  kind,
  x,
  y,
  hp: 100,
  maxHp: 100,
  boss,
  regrow: -1,
})
const arena = (enemies, tick = 100) => ({
  ...createFarm('2026-10-04'),
  position: [50, 50],
  crops: enemies,
  tick,
  nextBoss: Infinity,
  nextWave: Infinity,
  hurtUntil: 0,
})
const step = (s, surge = false) => stepFarm(s, s.position, surge)

describe('survivor combat', () => {
  it('chases the player at different speeds while ranged enemies keep distance', () => {
    const s = arena([
      enemy(0, 0, 10, 50),
      enemy(1, 1, 10, 50),
      enemy(2, 2, 40, 50),
      enemy(3, 3, 10, 50),
    ])
    const r = step(s).state
    expect(r.crops[0].x).toBeGreaterThan(10)
    expect(r.crops[1].x).toBeGreaterThan(r.crops[0].x)
    expect(r.crops[2].x).toBeLessThan(40)
    expect(r.crops[3].x).toBeLessThan(r.crops[0].x)
    expect(s.crops[0].x).toBe(10)
  })
  it('applies contact damage once, knocks back enemies and protects against piled-up attacks', () => {
    const s = arena([enemy(0, 0, 50, 50), enemy(1, 1, 51, 50)])
    const r = step(s)
    expect(r.state.hp).toBe(88)
    expect(r.events.filter((e) => e.kind === 'hurt')).toHaveLength(1)
    expect(r.state.hurtUntil).toBe(100 + FPS)
    expect(Math.hypot(r.state.crops[0].x - 50, r.state.crops[0].y - 50)).toBeGreaterThan(5)
    const protectedState = { ...r.state, crops: [enemy(2, 0, 50, 50)] }
    expect(step(protectedState).state.hp).toBe(88)
    expect(step({ ...protectedState, tick: protectedState.hurtUntil }).state.hp).toBe(76)
  })
  it('fires aimed projectiles and allows the player to avoid their path', () => {
    const s = arena([enemy(0, 2, 20, 50)], 128)
    const fired = step(s).state
    expect(fired.shots).toHaveLength(1)
    expect(fired.shots[0].dx).toBeGreaterThan(0)
    expect(fired.shots[0].dy).toBe(0)
    const incoming = {
      ...s,
      crops: [],
      shots: [{ id: 200, x: 46, y: 50, dx: 1, dy: 0, expires: 200 }],
    }
    expect(step(incoming).state.hp).toBe(86)
    expect(stepFarm(incoming, [50, 53]).state.hp).toBe(100)
  })
  it('telegraphs a boss slam for one second, then damages only players inside the marked area', () => {
    const s = arena([enemy(0, 3, 20, 20, true)], 128)
    const warning = step(s).state
    expect(warning.dangers).toHaveLength(1)
    expect(warning.dangers[0]).toMatchObject({ x: 50, y: 50, due: 144, radius: 15 })
    expect(warning.hp).toBe(100)
    const due = { ...warning, crops: [], tick: 144 }
    expect(step(due).state.hp).toBe(74)
    expect(step({ ...due, position: [80, 80] }).state.hp).toBe(100)
  })
  it('collects healing up to max health and grants defensive protection on burst', () => {
    const s = arena([])
    s.hp = 90
    s.loot = [{ id: 1, x: 50, y: 50, xp: 0, coins: 0, heal: 18 }]
    const r = step(s)
    expect(r.state.hp).toBe(100)
    expect(r.events.find((e) => e.kind === 'heal').points).toBe(10)
    const charged = {
      ...s,
      charge: 100,
      loot: [],
      shots: [{ id: 1, x: 49, y: 50, dx: 1, dy: 0, expires: 200 }],
      dangers: [{ id: 2, x: 50, y: 50, due: 100, radius: 15 }],
    }
    const burst = step(charged, true).state
    expect(burst.hp).toBe(90)
    expect(burst.shots).toHaveLength(0)
    expect(burst.dangers).toHaveLength(0)
    expect(burst.hurtUntil).toBe(116)
  })
  it('limits healing drops to one expiring pack, only while wounded, on a long cooldown', () => {
    const run = ({ tick = 200, hp = 70, harvested = 15, boss = false, loot = [] } = {}) => {
      const s = arena([], tick)
      s.hp = hp
      s.harvested = harvested
      // The band no longer carries a basic wave, so a kill needs an
      // instrument: the harp's rain reaches the crop next to the player.
      s.gear.echo = 1
      s.loot = loot
      s.crops = [enemy(1, 0, 62, 50, boss)]
      return step({ ...s, crops: [{ ...s.crops[0], hp: 1, maxHp: 1 }] }).state
    }
    const packs = (state) => state.loot.filter((drop) => drop.heal)
    const wounded = run()
    expect(packs(wounded)).toHaveLength(1)
    expect(packs(wounded)[0]).toMatchObject({ heal: 18, expires: 200 + HEAL_TTL })
    expect(wounded.nextHeal).toBe(200 + HEAL_COOLDOWN)
    expect(packs(run({ hp: 100 }))).toHaveLength(0)
    const killAgain = (state, tick) =>
      step({
        ...state,
        tick,
        harvested: 31,
        loot: [],
        crops: [{ ...enemy(2, 0, 62, 50), hp: 1, maxHp: 1 }],
      }).state
    expect(packs(killAgain(wounded, 200 + HEAL_COOLDOWN - 1))).toHaveLength(0)
    expect(packs(killAgain(wounded, 200 + HEAL_COOLDOWN))).toHaveLength(1)
    const occupied = step({
      ...wounded,
      tick: 200 + HEAL_COOLDOWN,
      harvested: 31,
      loot: [{ id: 900, x: 120, y: 50, xp: 0, coins: 0, heal: 18, expires: 9999 }],
      crops: [{ ...enemy(2, 0, 62, 50), hp: 1, maxHp: 1 }],
    }).state
    expect(packs(occupied)).toHaveLength(1)
    expect(
      packs(run({ loot: [{ id: 901, x: 60, y: 60, xp: 0, coins: 0, heal: 18, expires: 200 }] })),
    ).toHaveLength(0)
    const bossKill = run({ boss: true, hp: 90, harvested: 1 })
    expect(bossKill.hp).toBe(100)
    expect(run({ boss: true, hp: 100, harvested: 1 }).hp).toBe(100)
  })
  it('sends a slower bass boss with ring barrages, wide slams and richer rewards', () => {
    const bass = { ...enemy(0, 3, 20, 50, true), bass: true }
    const brute = { ...enemy(1, 3, 20, 50, true) }
    const chase = step({
      ...arena([bass, brute], 128),
      crops: [
        { ...bass, hp: 50, maxHp: 50 },
        { ...brute, hp: 50, maxHp: 50 },
      ],
    }).state
    expect(chase.crops[0].x - 20).toBeLessThan(chase.crops[1].x - 20)
    const barrage = step({ ...arena([bass], 144), crops: [{ ...bass, hp: 50, maxHp: 50 }] }).state
    expect(barrage.shots).toHaveLength(8)
    expect(
      new Set(barrage.shots.map((shot) => Math.round(Math.atan2(shot.dy, shot.dx) * 100))).size,
    ).toBe(8)
    const slam = step({ ...arena([bass], 96), crops: [{ ...bass, hp: 50, maxHp: 50 }] }).state
    expect(slam.dangers[0]).toMatchObject({ x: 50, y: 50, radius: 21, due: 112 })
    // Close enough for the sound wave, far enough to avoid contact damage.
    const killed = (boss) => {
      const s = arena([], 128)
      s.hp = 40
      s.gear.echo = 1
      s.crops = [{ ...boss, x: 38, y: 50, hp: 1, maxHp: 1 }]
      return step(s)
    }
    const bassKill = killed(bass),
      bruteKill = killed(brute)
    expect(bassKill.state.score).toBeGreaterThan(bruteKill.state.score)
    expect(bassKill.state.hp).toBe(75)
    expect(bruteKill.state.hp).toBe(70)
  })
  it('rings the star tambourine outwards, damaging and pushing monsters back', () => {
    const ring = (gear, tick) => {
      const s = arena(
        [{ id: 1, kind: 0, x: 56, y: 50, hp: 40, maxHp: 40, regrow: -1, boss: false }],
        tick,
      )
      Object.assign(s.gear, gear)
      s.nextWave = Infinity
      s.nextBoss = Infinity
      s.nextBass = Infinity
      return step(s)
    }
    const idle = ring({ bell: 0 }, 120)
    expect(idle.events.some((event) => event.kind === 'shock')).toBe(false)
    // A ring only lands on a tick that is both on its 22-frame cadence and on
    // the four-frame beat it is actually struck on.
    const struck = ring({ bell: 1 }, 88)
    expect(struck.state.crops[0].hp).toBeLessThan(40)
    expect(struck.state.crops[0].x).toBeGreaterThan(56)
    expect(struck.events.find((event) => event.kind === 'shock').radius).toBe(22)
    // The final form queues three rings instead of one, and its cadence drops to
    // every eight frames: the burst re-arms before the last queued ring is spent,
    // so rings keep landing on the four-frame beat.
    const first = ring({ bell: MAX_GEAR_LEVEL, sustain: MAX_GEAR_LEVEL }, 120)
    expect(first.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(first.state.bellRings).toBe(2)
    const second = step({ ...first.state, tick: 124 })
    const third = step({ ...second.state, tick: 128 })
    expect(second.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(third.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(third.state.bellRings).toBe(2)
    // The ring keeps its four-frame pulse: nothing sounds between two beats.
    expect(
      step({ ...third.state, tick: 130 }).events.filter((event) => event.kind === 'shock'),
    ).toHaveLength(0)
  })
  it('sends gold-record elites after 45 seconds: tougher, dashing and worth more', () => {
    const wave = (tick) => {
      const s = arena([], tick)
      s.nextWave = tick
      return step(s).state
    }
    expect(wave(20 * FPS).crops.some((crop) => crop.elite)).toBe(false)
    const horde = wave(936).crops
    const spawned = horde.filter((crop) => crop.elite)
    expect(spawned.length).toBe(1)
    const plain = horde.find((crop) => !crop.elite)
    expect(spawned[0].maxHp).toBeGreaterThan(plain ? plain.maxHp : 0)
    const elite = {
      id: 7,
      kind: 3,
      x: 20,
      y: 50,
      hp: 40,
      maxHp: 40,
      regrow: -1,
      boss: false,
      elite: true,
      dashUntil: -1,
    }
    const calm = step({ ...arena([{ ...elite }], 100), crops: [{ ...elite }] }).state
    const dashing = step({
      ...arena([{ ...elite }], 100),
      crops: [{ ...elite, dashUntil: 200 }],
    }).state
    expect(dashing.crops[0].x).toBeGreaterThan(calm.crops[0].x)
    const earned = (crop) => {
      const s = arena([], 128)
      s.hp = 40
      s.gear.echo = 1
      s.crops = [{ ...crop, x: 38, y: 50, hp: 1, maxHp: 1 }]
      return step(s).state
    }
    expect(earned(elite).score).toBeGreaterThan(
      earned({ id: 8, kind: 3, x: 38, y: 50, hp: 1, maxHp: 1, regrow: -1, boss: false }).score,
    )
  })
  it('drops rare shields that swallow a whole hit and stack up to three', () => {
    const pick = (loot) => {
      const s = arena([], 128)
      s.hp = 60
      s.loot = loot
      return step(s).state
    }
    expect(pick([{ id: 1, x: 50, y: 52, xp: 0, coins: 0, shield: 1 }])).toMatchObject({
      shields: 1,
      maxShields: 1,
    })
    expect(
      pick([
        { id: 1, x: 50, y: 52, xp: 0, coins: 0, shield: 1 },
        { id: 2, x: 50, y: 53, xp: 0, coins: 0, shield: 1 },
        { id: 3, x: 50, y: 54, xp: 0, coins: 0, shield: 1 },
        { id: 4, x: 50, y: 55, xp: 0, coins: 0, shield: 1 },
      ]),
    ).toMatchObject({ shields: SHIELD_LIMIT, maxShields: SHIELD_LIMIT })
    const guarded = arena([enemy(0, 0, 50, 50)], 128)
    guarded.shields = 1
    const absorbed = step(guarded)
    expect(absorbed.state.hp).toBe(100)
    expect(absorbed.state.shields).toBe(0)
    expect(absorbed.events.some((event) => event.kind === 'shield')).toBe(true)
    // A blocked hit still clears the crowd around the player.
    expect(
      Math.hypot(absorbed.state.crops[0].x - 50, absorbed.state.crops[0].y - 50),
    ).toBeGreaterThan(5)
    const exposed = {
      ...absorbed.state,
      tick: absorbed.state.hurtUntil,
      crops: [{ ...enemy(1, 0, 50, 50) }],
    }
    expect(step(exposed).state.hp).toBe(88)
    // Shields come from the same harvest cadence, on their own slower timer.
    const spawned = arena([], 128)
    spawned.harvested = 39
    spawned.nextShield = 0
    spawned.gear.echo = 1
    spawned.crops = [{ id: 1, kind: 0, x: 62, y: 50, hp: 1, maxHp: 1, regrow: -1, boss: false }]
    const wave = step(spawned).state
    expect(wave.loot.some((drop) => drop.shield)).toBe(true)
    expect(wave.nextShield).toBe(128 + SHIELD_COOLDOWN)
  })
  it('limits dropped shields to one every forty-five seconds even with rapid kills', () => {
    expect(SHIELD_COOLDOWN).toBe(45 * FPS)
    const kill = (tick, nextShield) => {
      const state = arena([], tick)
      state.harvested = 39
      state.nextShield = nextShield
      state.gear.echo = 1
      state.crops = [{ id: 1, kind: 0, x: 62, y: 50, hp: 1, maxHp: 1, regrow: -1, boss: false }]
      return step(state).state
    }
    const first = kill(128, 0)
    expect(first.loot.filter((drop) => drop.shield)).toHaveLength(1)
    expect(kill(first.nextShield - 1, first.nextShield).loot.some((drop) => drop.shield)).toBe(
      false,
    )
    expect(
      kill(first.nextShield, first.nextShield).loot.filter((drop) => drop.shield),
    ).toHaveLength(1)
  })

  it('turns a long combo into stronger instrument hits instead of a basic wave', () => {
    // The band no longer carries its own sound wave, so the combo tier rides
    // on every instrument: the same harp rain hits harder tier by tier.
    const wave = (combo) => {
      const s = arena(
        [{ id: 1, kind: 0, x: 50, y: 62, hp: 60, maxHp: 60, regrow: -1, boss: false }],
        128,
      )
      s.combo = combo
      s.lastHarvest = 128
      s.gear.echo = 1
      const result = step(s)
      return {
        hp: result.state.crops[0].hp,
        waves: result.events.filter((event) => event.kind === 'pulse').length,
      }
    }
    const calm = wave(0),
      warm = wave(30),
      hot = wave(60)
    expect(warm.hp).toBeLessThan(calm.hp)
    expect(hot.hp).toBeLessThan(warm.hp)
    // Nothing fires a wave of its own: only the surge and the black hole do.
    expect([calm.waves, warm.waves, hot.waves]).toEqual([0, 0, 0])
  })
  it('whistles homing arrows that pierce, then expire and stay capped', () => {
    const note = (id, x, y, expires = 9999) => ({ id, x, y, damage: 2, expires })
    const walk = (gear, trails = [], tick = 120, arrows = []) => {
      const s = arena(
        [{ id: 1, kind: 0, x: 58, y: 50, hp: 60, maxHp: 60, regrow: -1, boss: false }],
        tick,
      )
      Object.assign(s.gear, gear)
      s.trails = trails
      s.arrows = arrows
      s.nextWave = Infinity
      s.nextBoss = Infinity
      s.nextBass = Infinity
      return step(s).state
    }
    const clean = walk({ whistle: 0 })
    expect(clean.arrows).toHaveLength(0)
    // The whistle fires at the monster rather than dropping a field at its feet.
    const fired = walk({ whistle: 2 }, [], 126)
    expect(fired.arrows.length).toBeGreaterThan(0)
    expect(fired.arrows[0].pierce).toBeGreaterThan(0)
    // Chasing its target, an arrow reaches the monster and hurts it.
    let flown = { ...walk({ whistle: 5 }, [], 126) }
    const start = flown.arrows[0]
    expect(start).toBeTruthy()
    for (let index = 0; index < 12 && flown.crops[0].hp >= 60; index++)
      flown = step({ ...flown, crops: flown.crops, tick: flown.tick }).state
    expect(flown.crops[0].hp).toBeLessThan(60)
    // Expired arrows are dropped instead of piling up for the whole run.
    const stale = walk({ whistle: 2 }, [], 130, [
      {
        id: 5,
        x: 50,
        y: 50,
        angle: 0,
        damage: 3,
        pierce: 2,
        expires: 100,
        homing: true,
        cleared: [],
      },
    ])
    expect(stale.arrows.some((arrow) => arrow.id === 5)).toBe(false)
    const many = walk(
      { whistle: 1 },
      Array.from({ length: 40 }, (_, index) => note(index, 50, 50, 9999)),
      126,
      Array.from({ length: 40 }, (_, index) => ({
        id: index,
        x: 50,
        y: 50,
        angle: 0,
        damage: 2,
        pierce: 2,
        expires: 9999,
        homing: true,
        cleared: [],
      })),
    )
    expect(many.arrows.length).toBeLessThanOrEqual(12)
    expect(many.trails.length).toBeLessThanOrEqual(30)
    // A saturated arena still gets elites: they take over a slot that is
    // waiting to respawn instead of waiting for room in the monster pool.
    const crowded = {
      ...arena(
        Array.from({ length: 100 }, (_, index) => ({
          id: index,
          kind: 0,
          x: 40,
          y: 50,
          hp: index < 20 ? 30 : 0,
          maxHp: 30,
          regrow: 1e9,
          boss: false,
        })),
        720,
      ),
      nextWave: Infinity,
    }
    const promoted = step(crowded).state
    expect(promoted.crops.filter((crop) => crop.elite && crop.hp > 0).length).toBe(1)
    expect(promoted.crops.length).toBe(100)
    // A recycled monster slot must not keep the elite crown.
    const dead = {
      id: 3,
      kind: 3,
      x: 20,
      y: 50,
      hp: 0,
      maxHp: 40,
      regrow: 100,
      boss: false,
      elite: true,
      dashUntil: 500,
    }
    const recycled = step({
      ...arena([], 100),
      crops: [dead],
      nextWave: Infinity,
      nextBoss: Infinity,
      nextBass: Infinity,
    }).state.crops[0]
    expect(recycled.elite).toBe(false)
    expect(recycled.dashUntil).toBe(-1)
    expect(recycled.hp).toBeGreaterThan(0)
  })
  it('ends immediately at zero health without upgrades or further moves', () => {
    const s = arena([enemy(0, 0, 50, 50)])
    s.hp = 10
    s.xp = 100
    const r = step(s).state
    expect(r.hp).toBe(0)
    expect(r.offered).toHaveLength(0)
    expect(step(r)).toBeNull()
  })
  it('keeps spawning outside the player area and caps the enemy pool', () => {
    const s = arena([], 100)
    s.nextWave = 100
    const r = step(s).state
    // The opening wave starts at two arrivals and grows once every 300 ticks.
    expect(r.crops).toHaveLength(2)
    expect(r.crops.every((e) => Math.hypot(e.x - 50, e.y - 50) > 40)).toBe(true)
    const capped = { ...s, crops: Array.from({ length: 100 }, (_, id) => enemy(id, 0, -10, 0)) }
    expect(step(capped).state.crops).toHaveLength(100)
  })
})

// 余音：鼓点炸到的怪身上留一圈持续掉血的余音。场景里必须只有「该挨打的那只」够
// 得着——只要还有别的怪在射程内，鼓点就会自己接着响，掉血就分不清是谁打的。所以
// 第一帧让 A 站在玩家身边挨拍并被立刻收掉，它炸开的连锁把余音挂到射程外的 B 身
// 上，之后玩家一路后退，场上再没有怪能触发鼓点，B 的掉血就只剩余音。
const kit = (drum, range = 0) => ({ drum, range })
// 鼓点只打射程内最近的怪，连锁爆破能不能波及旁边那只只看爆破半径。
const kitReach = (gear) => 30 + gear.range * 6
const blastRadius = (gear) => 7 + gear.drum * 2 + (evolved(gear).includes('drum') ? 12 : 0)
const field = (gear, tick) => {
  const s = arena([], tick)
  s.nextBass = Infinity
  Object.assign(s.gear, gear)
  return s
}
// A 挨第一拍并被收掉，连锁把余音挂到射程外的 B；witness 再放一只 C，它只够挨到
// B 被余音收掉时那一发连锁，用来验证余音击杀一样会炸开。
const echoField = (gear, { tick = 99, hp = 400, witness = false } = {}) => {
  const s = field(gear, tick)
  const near = kitReach(gear) - 5,
    far = near + blastRadius(gear) - 1
  s.crops = [
    { ...enemy(1, 0, 50, 50 + near), hp: 1, maxHp: 1 },
    { ...enemy(3, 0, 50, 50 + far), hp, maxHp: hp },
  ]
  if (witness) s.crops.push({ ...enemy(4, 0, 50, 50 + far + 10), hp: 400, maxHp: 400 })
  return s
}
// 把玩家维持在离目标 gap 远的地方：远到鼓点打不到，怪身上就只剩余音在掉血。
const hold = (state, index, gap) => {
  const crop = state.crops[index]
  const dx = state.position[0] - crop.x,
    dy = state.position[1] - crop.y
  const length = Math.max(0.01, Math.hypot(dx, dy))
  const shift = Math.max(-MOVE_STEP, Math.min(MOVE_STEP, gap - length))
  return clampPoint(state.position, [
    state.position[0] + (dx / length) * shift,
    state.position[1] + (dy / length) * shift,
  ])
}
// stepFarm 每次只走一帧，余音的节奏只能靠逐帧记录血量来验证。第一帧不动（留在场
// 地中央让鼓点起拍），之后按 gap 把玩家拉开。每帧记的是「这一帧打完之后的样
// 子」，条目按被推进的那一帧编号：bled(trace, t) 就是第 t 帧造成的掉血。
const advance = (state, index, frames, gap) => {
  let running = state
  const snap = (tick, events) => ({
    tick,
    hp: running.crops[index].hp,
    echoUntil: running.crops[index].echoUntil ?? 0,
    echoNext: running.crops[index].echoNext ?? 0,
    marks: running.crops.map((crop) => crop.echoUntil ?? 0),
    events,
  })
  const trace = [snap(state.tick - 1, [])]
  for (let frame = 0; frame < frames; frame++) {
    const result = stepFarm(running, frame ? hold(running, index, gap) : running.position)
    if (!result) break
    running = result.state
    trace.push(snap(running.tick - 1, result.events))
  }
  return { state: running, trace }
}
const at = (trace, tick) => trace.find((entry) => entry.tick === tick)
const bled = (trace, tick) => at(trace, tick - 1).hp - at(trace, tick).hp
// 相对起拍帧的偏移：余音每 ECHO_INTERVAL 帧跳一次，掉血的帧应当正好落在这上面。
const bledAt = (trace, start) =>
  trace
    .filter((entry) => entry.tick > start && bled(trace, entry.tick) > 0)
    .map((entry) => entry.tick - start)
// 每个永久强化都是固定数值的一小步，这里只取加伤害的那几步。
const damageSteps = Object.freeze(
  Object.fromEntries(
    PERMANENT_UPGRADES.filter((step) => step.kind === 'damage')
      .slice(0, 3)
      .map((step) => [step.id, 1]),
  ),
)

describe('drum echo', () => {
  it('marks a blasted monster and bleeds exactly one drum level per beat', () => {
    const start = 99
    const gear = kit(3)
    const struck = step(echoField(gear, { tick: start })).state
    // 起拍这一帧就把余音挂上了：到期帧与下一次掉血的帧都是按当时的 tick 记的。
    expect(struck.crops[1].echoUntil).toBe(start + ECHO_SECONDS * FPS)
    expect(struck.crops[1].echoNext).toBe(start + ECHO_INTERVAL)
    const { trace } = advance(struck, 1, ECHO_INTERVAL, kitReach(gear) + 20)
    expect(bled(trace, start + ECHO_INTERVAL)).toBe(3)
    // 余音不吃暴击也不吃倍率，掉血就是掉血：它连事件都不发，视觉只看怪身上的标记。
    expect(at(trace, start + ECHO_INTERVAL).events).toHaveLength(0)
    // 进化后的鼓每跳掉两倍；满级鼓每 6 帧才响一次，起拍帧要落在它的节拍上。
    const loudGear = kit(MAX_GEAR_LEVEL, MAX_GEAR_LEVEL)
    const loudStart = 96
    const loud = step(echoField(loudGear, { tick: loudStart })).state
    expect(loud.crops[1].echoUntil).toBe(loudStart + ECHO_SECONDS * FPS)
    const loudTrace = advance(loud, 1, ECHO_INTERVAL, kitReach(loudGear) + 20).trace
    expect(bled(loudTrace, loudStart + ECHO_INTERVAL)).toBe(MAX_GEAR_LEVEL * 2)
  })
  it('bleeds on its own beat for four seconds and then stops', () => {
    const start = 99
    const gear = kit(3)
    const struck = step(echoField(gear, { tick: start })).state
    const { trace } = advance(struck, 1, FPS * (ECHO_SECONDS + 1), kitReach(gear) + 20)
    expect(bledAt(trace, start)).toEqual([16, 32, 48, ECHO_SECONDS * FPS])
    for (const offset of [16, 32, 48, ECHO_SECONDS * FPS])
      expect(bled(trace, start + offset)).toBe(3)
    // 到期帧掉完最后一跳就清干净，第五秒不再掉。
    expect(at(trace, start + ECHO_SECONDS * FPS).echoUntil).toBe(0)
    expect(at(trace, start + FPS * (ECHO_SECONDS + 1)).hp).toBe(
      at(trace, start + ECHO_SECONDS * FPS).hp,
    )
  })
  it('refreshes the echo instead of stacking it when blasts keep landing', () => {
    const start = 99
    const gear = kit(3)
    // 只有一只怪待在射程里：鼓点每 11 帧响一次，余音每 16 帧跳一次。
    const solo = field(gear, start)
    solo.crops = [{ ...enemy(3, 0, 50, 72), hp: 400, maxHp: 400 }]
    const close = advance(solo, 0, 23, 22)
    // 第二拍只把到期帧往后推，掉血的节拍不被推迟——否则密集爆破会让它永远不掉血。
    expect(at(close.trace, start + 11).echoUntil).toBe(start + 11 + ECHO_SECONDS * FPS)
    expect(at(close.trace, start + 11).echoNext).toBe(start + ECHO_INTERVAL)
    expect(at(close.trace, start + 22).echoUntil).toBe(start + 22 + ECHO_SECONDS * FPS)
    // 之后把玩家拉开，场上再没有怪够得着，剩下的掉血只可能是余音。
    const far = advance(close.state, 0, 60, kitReach(gear) + 20)
    const trace = [...close.trace, ...far.trace.slice(1)]
    // 11 与 22 是爆破本身（8 点），其余每 16 帧一跳、每跳都还是 3 点，一共五跳。
    expect(bledAt(trace, start)).toEqual([11, 16, 22, 32, 48, 64, 80])
    expect(bled(trace, start + 11)).toBe(8)
    expect(bled(trace, start + 22)).toBe(8)
    for (const offset of [16, 32, 48, 64, 80]) expect(bled(trace, start + offset)).toBe(3)
  })
  it('keeps the echo out of the damage pipeline: no crit, no run multiplier', () => {
    const start = 99
    const gear = kit(3)
    const gap = kitReach(gear) + 20
    const frames = FPS * ECHO_SECONDS + 8
    const plain = advance(echoField(gear, { tick: start }), 1, frames, gap).trace
    const boosted = echoField(gear, { tick: start })
    // 超频卡、永久伤害与暴击（lucky）一起堆满。
    boosted.permanent = damageSteps
    boosted.growth = { ...boosted.growth, power: MAX_STAT_LEVEL }
    Object.assign(boosted.gear, { lucky: MAX_GEAR_LEVEL })
    const loud = advance(boosted, 1, frames, gap).trace
    // 爆破吃倍率：同一拍打得更狠。
    expect(bled(loud, start)).toBeGreaterThan(bled(plain, start) * 2)
    // 余音不吃：每一跳的数值一个不差。
    for (const offset of [ECHO_INTERVAL, 32, 48, 64])
      expect(bled(loud, start + offset)).toBe(bled(plain, start + offset))
    expect([bled(plain, start + ECHO_INTERVAL), bled(loud, start + ECHO_INTERVAL)]).toEqual([3, 3])
  })
  it('harvests and chains again when an echo tick lands the kill', () => {
    const start = 99
    const gear = kit(3)
    // 17 点血：挨完起拍那两发连锁（8 + 8）还剩 1 点，正好由第一跳余音收掉。
    const struck = step(echoField(gear, { tick: start, hp: 17, witness: true })).state
    const { trace, state } = advance(struck, 1, 20, kitReach(gear) + 20)
    // 掉血还没跳的时候既没收怪，也没给旁边的 C 挂余音。
    expect(at(trace, start + ECHO_INTERVAL - 1).hp).toBeGreaterThan(0)
    expect(at(trace, start + ECHO_INTERVAL - 1).marks[2]).toBe(0)
    const kill = at(trace, start + ECHO_INTERVAL)
    expect(kill.hp).toBe(0)
    expect(kill.events.filter((event) => event.kind === 'harvest')).toHaveLength(1)
    // 收掉它的连锁照样炸开，并给周围的怪挂上新一轮余音。
    expect(kill.marks[2]).toBe(start + ECHO_INTERVAL + ECHO_SECONDS * FPS)
    expect(state.harvested).toBe(2)
    expect(state.score).toBeGreaterThan(0)
    expect(state.loot.some((drop) => drop.coins > 0 && drop.xp > 0)).toBe(true)
  })
  it('leaves no echo behind when the band carries no drum', () => {
    const start = 99
    const s = field(kit(0, MAX_GEAR_LEVEL), start)
    s.crops = [{ ...enemy(3, 0, 50, 72), hp: 400, maxHp: 400 }]
    const { trace, state } = advance(s, 0, FPS * (ECHO_SECONDS + 1), 22)
    expect(trace.every((entry) => entry.marks.every((mark) => !mark))).toBe(true)
    expect(trace.some((entry) => entry.events.some((event) => event.kind === 'blast'))).toBe(false)
    expect(state.crops[0].hp).toBe(400)
  })
})
