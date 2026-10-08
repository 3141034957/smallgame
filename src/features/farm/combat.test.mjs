import { describe, it, expect } from 'vitest'
import {
  createFarm,
  stepFarm,
  FPS,
  HEAL_COOLDOWN,
  HEAL_TTL,
  MAX_GEAR_LEVEL,
  SHIELD_COOLDOWN,
  SHIELD_LIMIT,
} from './rules.mjs'
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
    const struck = ring({ bell: 1 }, 120)
    expect(struck.state.crops[0].hp).toBeLessThan(40)
    expect(struck.state.crops[0].x).toBeGreaterThan(56)
    expect(struck.events.find((event) => event.kind === 'shock').radius).toBe(30)
    // The final form fires three rings in a row instead of one.
    const first = ring({ bell: MAX_GEAR_LEVEL, sustain: MAX_GEAR_LEVEL }, 120)
    expect(first.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(first.state.bellRings).toBe(2)
    const second = step({ ...first.state, tick: 124 })
    const third = step({ ...second.state, tick: 128 })
    expect(second.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(third.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(third.state.bellRings).toBe(0)
    // The ring cadence shortens with the top-level chip, so the quiet tick moves too.
    expect(
      step({ ...third.state, tick: 132 }).events.filter((event) => event.kind === 'shock'),
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
    expect(r.crops).toHaveLength(3)
    expect(r.crops.every((e) => Math.hypot(e.x - 50, e.y - 50) > 40)).toBe(true)
    const capped = { ...s, crops: Array.from({ length: 100 }, (_, id) => enemy(id, 0, -10, 0)) }
    expect(step(capped).state.crops).toHaveLength(100)
  })
})
