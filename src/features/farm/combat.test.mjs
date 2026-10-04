import { describe, it, expect } from 'vitest'
import { createFarm, stepFarm, FPS, HEAL_COOLDOWN, HEAL_TTL } from './rules.mjs'
const enemy = (id, kind, x, y, boss = false) => ({ id, kind, x, y, hp: 100, maxHp: 100, boss, regrow: -1 })
const arena = (enemies, tick = 100) => ({ ...createFarm('2026-10-04'), position: [50,50], crops: enemies, tick, nextBoss: Infinity, nextWave: Infinity, lastPulse: tick, hurtUntil: 0 })
const step = (s, surge = false) => stepFarm(s, s.position, surge)

describe('survivor combat', () => {
  it('chases the player at different speeds while ranged enemies keep distance', () => {
    const s = arena([enemy(0, 0, 10,50), enemy(1, 1,10,50), enemy(2,2,40,50), enemy(3,3,10,50)])
    const r = step(s).state
    expect(r.crops[0].x).toBeGreaterThan(10)
    expect(r.crops[1].x).toBeGreaterThan(r.crops[0].x)
    expect(r.crops[2].x).toBeLessThan(40)
    expect(r.crops[3].x).toBeLessThan(r.crops[0].x)
    expect(s.crops[0].x).toBe(10)
  })
  it('applies contact damage once, knocks back enemies and protects against piled-up attacks', () => {
    const s = arena([enemy(0,0,50,50),enemy(1,1,51,50)])
    const r = step(s)
    expect(r.state.hp).toBe(88)
    expect(r.events.filter(e=>e.kind==='hurt')).toHaveLength(1)
    expect(r.state.hurtUntil).toBe(100+FPS)
    expect(Math.hypot(r.state.crops[0].x-50,r.state.crops[0].y-50)).toBeGreaterThan(5)
    const protectedState = {...r.state,crops:[enemy(2,0,50,50)]}
    expect(step(protectedState).state.hp).toBe(88)
    expect(step({...protectedState,tick:protectedState.hurtUntil}).state.hp).toBe(76)
  })
  it('fires aimed projectiles and allows the player to avoid their path', () => {
    const s = arena([enemy(0,2,20,50)],128)
    const fired = step(s).state
    expect(fired.shots).toHaveLength(1)
    expect(fired.shots[0].dx).toBeGreaterThan(0)
    expect(fired.shots[0].dy).toBe(0)
    const incoming = {...s,crops:[],shots:[{id:200,x:46,y:50,dx:1,dy:0,expires:200}]}
    expect(step(incoming).state.hp).toBe(86)
    expect(stepFarm(incoming,[50,53]).state.hp).toBe(100)
  })
  it('telegraphs a boss slam for one second, then damages only players inside the marked area', () => {
    const s = arena([enemy(0,3,20,20,true)],128)
    const warning = step(s).state
    expect(warning.dangers).toHaveLength(1)
    expect(warning.dangers[0]).toMatchObject({x:50,y:50,due:144,radius:15})
    expect(warning.hp).toBe(100)
    const due = {...warning,crops:[],tick:144}
    expect(step(due).state.hp).toBe(74)
    expect(step({...due,position:[80,80]}).state.hp).toBe(100)
  })
  it('collects healing up to max health and grants defensive protection on burst', () => {
    const s = arena([]); s.hp=90;s.loot=[{id:1,x:50,y:50,xp:0,coins:0,heal:18}]
    const r = step(s)
    expect(r.state.hp).toBe(100)
    expect(r.events.find(e=>e.kind==='heal').points).toBe(10)
    const charged = {...s,charge:100,loot:[],shots:[{id:1,x:49,y:50,dx:1,dy:0,expires:200}],dangers:[{id:2,x:50,y:50,due:100,radius:15}]}
    const burst = step(charged,true).state
    expect(burst.hp).toBe(90)
    expect(burst.shots).toHaveLength(0)
    expect(burst.dangers).toHaveLength(0)
    expect(burst.hurtUntil).toBe(116)
  })
  it('limits healing drops to one expiring pack, only while wounded, on a long cooldown', () => {
    const run = ({ tick = 200, hp = 70, harvested = 15, boss = false, loot = [] } = {}) => {
      const s = arena([], tick)
      s.hp = hp; s.harvested = harvested; s.lastPulse = tick - 20; s.loot = loot
      s.crops = [enemy(1, 0, 62, 50, boss)]
      return step({ ...s, crops: [{ ...s.crops[0], hp: 1, maxHp: 1 }] }).state
    }
    const packs = (state) => state.loot.filter((drop) => drop.heal)
    const wounded = run()
    expect(packs(wounded)).toHaveLength(1)
    expect(packs(wounded)[0]).toMatchObject({ heal: 18, expires: 200 + HEAL_TTL })
    expect(wounded.nextHeal).toBe(200 + HEAL_COOLDOWN)
    expect(packs(run({ hp: 100 }))).toHaveLength(0)
    const killAgain = (state, tick) => step({ ...state, tick, lastPulse: tick - 20, harvested: 31, loot: [], crops: [{ ...enemy(2, 0, 62, 50), hp: 1, maxHp: 1 }] }).state
    expect(packs(killAgain(wounded, 200 + HEAL_COOLDOWN - 1))).toHaveLength(0)
    expect(packs(killAgain(wounded, 200 + HEAL_COOLDOWN))).toHaveLength(1)
    const occupied = step({ ...wounded, tick: 200 + HEAL_COOLDOWN, lastPulse: 200 + HEAL_COOLDOWN - 20, harvested: 31, loot: [{ id: 900, x: 120, y: 50, xp: 0, coins: 0, heal: 18, expires: 9999 }], crops: [{ ...enemy(2, 0, 62, 50), hp: 1, maxHp: 1 }] }).state
    expect(packs(occupied)).toHaveLength(1)
    expect(packs(run({ loot: [{ id: 901, x: 60, y: 60, xp: 0, coins: 0, heal: 18, expires: 200 }] }))).toHaveLength(0)
    const bossKill = run({ boss: true, hp: 90, harvested: 1 })
    expect(bossKill.hp).toBe(100)
    expect(run({ boss: true, hp: 100, harvested: 1 }).hp).toBe(100)
  })
  it('sends a slower bass boss with ring barrages, wide slams and richer rewards', () => {
    const bass = { ...enemy(0, 3, 20, 50, true), bass: true }
    const brute = { ...enemy(1, 3, 20, 50, true) }
    const chase = step({ ...arena([bass, brute], 128), crops: [{ ...bass, hp: 50, maxHp: 50 }, { ...brute, hp: 50, maxHp: 50 }] }).state
    expect(chase.crops[0].x - 20).toBeLessThan(chase.crops[1].x - 20)
    const barrage = step({ ...arena([bass], 144), crops: [{ ...bass, hp: 50, maxHp: 50 }] }).state
    expect(barrage.shots).toHaveLength(8)
    expect(new Set(barrage.shots.map((shot) => Math.round(Math.atan2(shot.dy, shot.dx) * 100))).size).toBe(8)
    const slam = step({ ...arena([bass], 96), crops: [{ ...bass, hp: 50, maxHp: 50 }] }).state
    expect(slam.dangers[0]).toMatchObject({ x: 50, y: 50, radius: 21, due: 112 })
    // Close enough for the sound wave, far enough to avoid contact damage.
    const killed = (boss) => {
      const s = arena([], 128); s.hp = 40; s.lastPulse = 108
      s.crops = [{ ...boss, x: 38, y: 50, hp: 1, maxHp: 1 }]
      return step(s)
    }
    const bassKill = killed(bass), bruteKill = killed(brute)
    expect(bassKill.state.score).toBeGreaterThan(bruteKill.state.score)
    expect(bassKill.state.hp).toBe(75)
    expect(bruteKill.state.hp).toBe(70)
  })
  it('rings the star tambourine outwards, damaging and pushing monsters back', () => {
    const ring = (gear, tick) => {
      const s = arena([{ id: 1, kind: 0, x: 56, y: 50, hp: 40, maxHp: 40, regrow: -1, boss: false }], tick)
      Object.assign(s.gear, gear)
      s.nextWave = Infinity; s.nextBoss = Infinity; s.nextBass = Infinity; s.lastPulse = tick
      return step(s)
    }
    const idle = ring({ bell: 0 }, 120)
    expect(idle.events.some((event) => event.kind === 'shock')).toBe(false)
    const struck = ring({ bell: 1 }, 120)
    expect(struck.state.crops[0].hp).toBeLessThan(40)
    expect(struck.state.crops[0].x).toBeGreaterThan(56)
    expect(struck.events.find((event) => event.kind === 'shock').radius).toBe(30)
    // The final form fires three rings in a row instead of one.
    const first = ring({ bell: 3, sustain: 3 }, 108)
    expect(first.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(first.state.bellRings).toBe(2)
    const second = step({ ...first.state, tick: 112, lastPulse: 112 })
    const third = step({ ...second.state, tick: 116, lastPulse: 116 })
    expect(second.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(third.events.filter((event) => event.kind === 'shock')).toHaveLength(1)
    expect(third.state.bellRings).toBe(0)
    expect(step({ ...third.state, tick: 120, lastPulse: 120 }).events.filter((event) => event.kind === 'shock')).toHaveLength(0)
  })
  it('ends immediately at zero health without upgrades or further moves', () => {
    const s=arena([enemy(0,0,50,50)]);s.hp=10;s.xp=100
    const r=step(s).state
    expect(r.hp).toBe(0)
    expect(r.offered).toHaveLength(0)
    expect(step(r)).toBeNull()
  })
  it('keeps spawning outside the player area and caps the enemy pool', () => {
    const s=arena([],100);s.nextWave=100
    const r=step(s).state
    expect(r.crops).toHaveLength(3)
    expect(r.crops.every(e=>Math.hypot(e.x-50,e.y-50)>40)).toBe(true)
    const capped={...s,crops:Array.from({length:100},(_,id)=>enemy(id,0,-10,0))}
    expect(step(capped).state.crops).toHaveLength(100)
  })
})
