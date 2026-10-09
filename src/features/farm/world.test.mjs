import { describe, expect, it } from 'vitest'
import {
  clampPoint,
  createFarm,
  stepFarm,
  chooseTalent,
  replayFarm,
  farmReach,
  farmSpawnRadius,
  FPS,
  MAX_BOSSES,
} from './rules.mjs'
import { verifyFarm } from '../../../server/farm.mjs'
const day = '2026-10-04'
const monster = (id, x, y) => ({ id, x, y, kind: 0, hp: 30, maxHp: 30, boss: false, regrow: -1 })
const arena = (position = [50, 76]) => ({
  ...createFarm(day),
  position,
  crops: [],
  nextWave: Infinity,
  nextBoss: Infinity,
  tick: 100,
})

describe('unbounded combat world', () => {
  it('allows negative and distant coordinates while rejecting teleporting and unsafe numbers', () => {
    const s = arena([-450, 1800])
    expect(stepFarm(s, [-453, 1800]).state.position).toEqual([-453, 1800])
    expect(stepFarm(s, [-455, 1800])).toBeNull()
    expect(stepFarm(s, [Number.MAX_SAFE_INTEGER + 1, 1800])).toBeNull()
    expect(stepFarm(s, [-450.1, 1800])).toBeNull()
  })
  it('spawns around the current position and safely recycles distant monsters without rewards or healing them', () => {
    const s = arena([1500, -2000])
    s.nextWave = 100
    s.crops = [monster(10, -500, 300)]
    s.crops[0].hp = 7
    const r = stepFarm(s, s.position).state
    // The opening wave is two arrivals, plus the monster already on the field.
    expect(r.crops).toHaveLength(3)
    for (const enemy of r.crops) {
      const distance = Math.hypot((enemy.x - 1500) * 0.84, enemy.y + 2000)
      expect(distance).toBeGreaterThanOrEqual(52)
      expect(distance).toBeLessThanOrEqual(68)
      expect(enemy.spawnAt).toBe(112)
    }
    expect(r.crops[0].hp).toBe(7)
    expect(r.harvested).toBe(0)
    expect(r.score).toBe(0)
    expect(s.crops[0].x).toBe(-500)
  })
  it('grows the arrival ring past the build coverage so a maxed loadout cannot reap a spawn', () => {
    const s = arena()
    Object.assign(s.gear, { bell: 5, sustain: 5, range: 5, mute: 5, arp: 5 })
    s.nextWave = 100
    const r = stepFarm(s, s.position).state
    // No chip widens an attack any more: the ring only has to clear whatever
    // the sweeping attacks cover, and that coverage is no longer inflated.
    const reach = farmReach(r)
    expect(reach).toBe(79)
    // The ring always sits one fixed walk beyond that coverage, so a maxed
    // loadout still watches the horde close in instead of reaping it on arrival.
    expect(farmSpawnRadius(r)).toBe(reach + 14)
    expect(r.crops.length).toBeGreaterThan(0)
    for (const enemy of r.crops) {
      const gap = Math.hypot((enemy.x - 50) * 0.84, enemy.y - 76)
      expect(gap).toBeGreaterThan(reach)
      expect(gap).toBeLessThanOrEqual(134)
      expect(enemy.spawnAt).toBe(112)
    }
    // An empty loadout keeps the ring the opening minute was balanced around.
    expect(farmSpawnRadius(arena())).toBe(52)
  })
  it('keeps portal arrivals harmless during their warning', () => {
    const s = arena()
    s.crops = [{ ...monster(1, 50, 76), spawnAt: 110 }]
    s.hurtUntil = 0
    const r = stepFarm(s, s.position).state
    expect(r.hp).toBe(100)
    expect(r.crops[0].hp).toBe(30)
    expect(r.crops[0].x).toBe(50)
  })
  it('keeps enemy projectiles active far outside the old arena and clears expired or distant ones', () => {
    const s = arena([1000, -1000])
    s.hurtUntil = 0
    s.shots = [
      { id: 1, x: 998, y: -1000, dx: 1, dy: 0, expires: 200 },
      { id: 2, x: 1020, y: -1000, dx: -1, dy: 0, expires: 200 },
      { id: 3, x: 30, y: 30, dx: 1, dy: 0, expires: 200 },
      { id: 4, x: 1020, y: -990, dx: 0, dy: 1, expires: 99 },
    ]
    const r = stepFarm(s, s.position).state
    expect(r.hp).toBe(86)
    expect(r.shots.map((p) => p.id)).toEqual([2])
    expect(r.shots[0].x).toBe(1019)
  })
  it('retains nearby drops in world space and bounds abandoned drop memory', () => {
    const s = arena([1000, -1000])
    s.loot = [
      { id: 1, x: 1000, y: -950, xp: 5, coins: 8 },
      { id: 2, x: 0, y: 0, xp: 5, coins: 8 },
    ]
    expect(stepFarm(s, s.position).state.loot).toEqual([s.loot[0]])
    s.loot = Array.from({ length: 700 }, (_, id) => ({ id, x: 1050, y: -1000, xp: 5, coins: 8 }))
    expect(stepFarm(s, s.position).state.loot).toHaveLength(600)
  })
  it('replays and verifies a completed journey beyond multiple old boundaries', () => {
    // A run is always played as a member, and that member decides the opening
    // instrument: the server rebuilds the same loadout, so submit as one.
    let state = createFarm(day, {}, 'bear-drums')
    const frames = [],
      choices = [],
      surges = []
    // Seven minutes of travel leaves three to end the run: a finished loadout
    // now reaps everything that walks at it, so dying takes a real fight.
    while (state.tick < FPS * 60 * 7 && state.hp > 0) {
      while (state.offered.length) {
        const id = state.offered[0]
        choices.push({ tick: state.tick, id })
        state = chooseTalent(state, id)
      }
      const point = clampPoint(state.position, [50 + state.tick * 0.9, 76 - state.tick * 0.4])
      const burst = state.charge === 100
      if (burst) surges.push(state.tick)
      frames.push(point)
      state = stepFarm(state, point, burst).state
    }
    // The journey itself is safe: the drummer out-runs the crowd that spawns
    // around it. A run is only complete once it is over, so it ends by walking
    // into the nearest monster, which is how every other finished run dies.
    while (state.hp > 0 && frames.length < FPS * 60 * 10) {
      while (state.offered.length) {
        const id = state.offered[0]
        choices.push({ tick: state.tick, id })
        state = chooseTalent(state, id)
      }
      let closest = null,
        nearest = Infinity
      for (const crop of state.crops) {
        if (crop.hp <= 0) continue
        const gap = Math.hypot((crop.x - state.position[0]) * 0.84, crop.y - state.position[1])
        if (gap < nearest) {
          nearest = gap
          closest = crop
        }
      }
      const point = clampPoint(state.position, closest ? [closest.x, closest.y] : state.position)
      const burst = state.charge === 100
      if (burst) surges.push(state.tick)
      frames.push(point)
      state = stepFarm(state, point, burst).state
    }
    expect(state.tick).toBeGreaterThan(400)
    expect(state.hp).toBe(0)
    expect(state.position[0]).toBeGreaterThan(400)
    expect(state.position[1]).toBeLessThan(-100)
    const round = replayFarm(day, frames, choices, surges, {}, 'bear-drums')
    expect(round).toMatchObject({
      score: state.score,
      hp: state.hp,
      seconds: state.tick / 16,
      outcome: 'defeated',
    })
    expect(
      verifyFarm({
        ...round,
        playerId: 'world_test_player',
        name: '远行乐手',
        characterId: 'bear-drums',
      })?.score,
    ).toBe(state.score)
    const forged = frames.map((p) => [...p])
    forged[300][0] += 100
    expect(replayFarm(day, forged, choices, surges, {}, 'bear-drums')).toBeNull()
    expect(state.crops.length).toBeLessThanOrEqual(100 + MAX_BOSSES)
    expect(state.loot.length).toBeLessThanOrEqual(600)
  })
})
