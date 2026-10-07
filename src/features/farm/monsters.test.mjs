import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MONSTERS, monsterFor, regularMonsterKind } from './monsters.mjs'
import { createFarm, stepFarm, FPS } from './rules.mjs'

const enemy = (kind, patch = {}) => ({
  id: 0,
  kind,
  x: 20,
  y: 50,
  hp: 100,
  maxHp: 100,
  boss: false,
  regrow: -1,
  ...patch,
})
const arena = (tick, crops = []) => ({
  ...createFarm('2026-10-04'),
  modifier: 'none',
  position: [50, 50],
  tick,
  crops,
  nextWave: Infinity,
  nextBoss: Infinity,
  nextBass: Infinity,
  hurtUntil: 0,
})
const step = (state) => stepFarm(state, state.position)

describe('new monster roster and encounters', () => {
  it('ships seven separate transparent WebPs and maps every enemy to its correct artwork', () => {
    expect(MONSTERS).toHaveLength(7)
    const examples = [
      enemy(0),
      enemy(1),
      enemy(2),
      enemy(3),
      enemy(3, { elite: true }),
      enemy(3, { boss: true }),
      enemy(3, { boss: true, bass: true }),
    ]
    for (const [index, example] of examples.entries()) {
      const info = monsterFor(example)
      expect(info.id).toBe(MONSTERS[index].id)
      const webp = readFileSync(resolve('public', info.image))
      expect(webp.subarray(0, 4).toString()).toBe('RIFF')
      expect(webp.subarray(8, 16).toString()).toBe('WEBPVP8X')
      expect(webp[20] & 0x10).toBe(0x10) // Alpha, not a flattened preview.
    }
  })
  it('unlocks ordinary monsters at the advertised boundaries, including recycled slots', () => {
    expect(createFarm('2026-10-04').crops.every((crop) => crop.kind === 0)).toBe(true)
    for (const monster of MONSTERS.slice(1, 4)) {
      const before = monster.starts * FPS - 1,
        after = monster.starts * FPS
      for (let id = 0; id < 20; id++)
        expect(regularMonsterKind(before, FPS, id)).not.toBe(monster.kind)
      const state = arena(after)
      state.nextWave = after
      expect(step(state).state.crops.some((crop) => crop.kind === monster.kind)).toBe(true)
      const dead = Array.from({ length: 12 }, (_, id) => enemy(0, { id, hp: 0, regrow: after }))
      const respawned = step(arena(after, dead)).state.crops
      expect(respawned.some((crop) => crop.kind === monster.kind)).toBe(true)
      expect(respawned.every((crop) => crop.spawnAt === after + 12)).toBe(true)
    }
  })
  it('keeps the elite encounter available even when every ordinary slot is alive', () => {
    const state = arena(
      45 * FPS,
      Array.from({ length: 100 }, (_, id) => enemy(0, { id, x: 10 - id })),
    )
    const next = step(state).state
    expect(next.crops).toHaveLength(100)
    expect(next.crops.filter((crop) => crop.elite)).toHaveLength(1)
    expect(next.score).toBe(0)
    expect(next.harvested).toBe(0)
  })
  it('alternates one boss every two minutes on every day, including the brisk modifier', () => {
    for (let date = 1; date <= 28; date++) {
      const state = createFarm(`2026-10-${String(date).padStart(2, '0')}`)
      expect(state.nextBoss).toBe(120 * FPS)
      expect(state.nextBass).toBe(240 * FPS)
      state.crops = []
      state.nextWave = Infinity
      for (let seconds = 120; seconds <= 720; seconds += 120) {
        // Keep the scheduled timers from the previous appearance, while isolating combat.
        state.tick = seconds * FPS - 1
        state.crops = []
        const before = step(state).state
        expect(before.crops.some((crop) => crop.boss)).toBe(false)
        const due = step(before).state
        const bosses = due.crops.filter((crop) => crop.boss)
        expect(bosses).toHaveLength(1)
        expect(monsterFor(bosses[0]).id).toBe(seconds % 240 === 0 ? 'bass-boss' : 'drum-boss')
        expect(Math.min(due.nextBoss, due.nextBass)).toBe((seconds + 120) * FPS)
        expect(step({ ...due, crops: [] }).state.crops.some((crop) => crop.boss)).toBe(false)
        state.nextBoss = due.nextBoss
        state.nextBass = due.nextBass
      }
    }
  })
  it('skips a full boss slot until the next scheduled appearance instead of refilling immediately', () => {
    const state = arena(120 * FPS)
    state.nextBoss = 120 * FPS
    state.nextBass = 240 * FPS
    state.crops = Array.from({ length: 4 }, (_, id) => enemy(3, { id, boss: true }))
    const full = step(state).state
    expect(full.crops.filter((crop) => crop.boss)).toHaveLength(4)
    expect(full.nextBoss).toBe(360 * FPS)
    expect(step({ ...full, crops: [] }).state.crops.some((crop) => crop.boss)).toBe(false)
  })
  it('respects the boss cap and reserves a slot for the bass boss when both timers are due', () => {
    const state = arena(240 * FPS)
    state.nextBoss = state.tick
    state.nextBass = state.tick
    state.crops = [enemy(3, { boss: true, id: 5 }), enemy(3, { boss: true, id: 6 })]
    const next = step(state).state
    expect(next.crops.filter((crop) => crop.boss)).toHaveLength(4)
    expect(next.crops.some((crop) => crop.bass)).toBe(true)
  })
  it('warns before a bat dash, locks its direction and pauses during recovery', () => {
    let state = arena(160, [enemy(1)])
    const warned = step(state).state
    expect(warned.crops[0]).toMatchObject({ x: 20, y: 50, windupUntil: 168 })
    expect(warned.hp).toBe(100)
    state = { ...warned, tick: 168, position: [50, 53] }
    const dashed = step(state).state
    expect(dashed.crops[0].x).toBeGreaterThan(20)
    expect(dashed.crops[0].y).toBe(50)
    expect(dashed.crops[0].dashUntil).toBe(176)
    const recovering = step({ ...dashed, tick: 176 }).state
    expect(recovering.crops[0].x).toBe(dashed.crops[0].x)
    expect(recovering.crops[0].y).toBe(dashed.crops[0].y)
    expect(warned.crops[0].x).toBe(20) // Inputs stay immutable.
  })
  it('telegraphs heavy slams, allows escape, and cancels the attack when its source dies', () => {
    const state = arena(96, [enemy(3, { x: 40 })])
    const warned = step(state).state
    expect(warned.dangers[0]).toMatchObject({ sourceId: 0, damage: 18, radius: 11, due: 112 })
    expect(warned.hp).toBe(100)
    const struck = step({ ...warned, tick: 112 }).state
    expect(struck.hp).toBe(82)
    expect(step({ ...warned, tick: 112, position: [65, 50] }).state.hp).toBe(100)
    const interrupted = step({ ...warned, tick: 112, crops: [] }).state
    expect(interrupted.hp).toBe(100)
    expect(interrupted.dangers).toEqual([])
  })
  it('adds later fan fire and elite scatter while keeping enemy bullets capped at sixty', () => {
    const noise = step(arena(120 * FPS, [enemy(2)])).state
    expect(noise.shots).toHaveLength(3)
    expect(noise.shots.map((shot) => shot.dy).sort((a, b) => a - b)[0]).toBeLessThan(0)
    const elite = step(arena(90 * FPS, [enemy(3, { elite: true, dashUntil: 90 * FPS })])).state
    expect(elite.shots).toHaveLength(6)
    expect(elite.shots.every((shot) => shot.kind === 'record' && shot.damage === 12)).toBe(true)
    const bass = arena(144, [enemy(3, { boss: true, bass: true })])
    bass.shots = Array.from({ length: 59 }, (_, id) => ({
      id,
      x: 10,
      y: 10,
      dx: 0,
      dy: 0,
      expires: 500,
    }))
    expect(step(bass).state.shots).toHaveLength(60)
    const drum = step(arena(120 * FPS, [enemy(3, { boss: true })])).state
    expect(drum.dangers.map((danger) => danger.due)).toEqual([120 * FPS + FPS, 120 * FPS + FPS * 2])
  })
})
