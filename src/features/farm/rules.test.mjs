import { describe, expect, it } from 'vitest'
import { FPS, FRAMES, RECIPES, TALENTS, THRESHOLDS, chooseTalent, clampPoint, createFarm, evolved, orbitPositions, replayFarm, stepFarm } from './rules.mjs'

const day = '2026-10-04'
const crop = (id, x, y, hp = 1) => ({ id, x, y, hp, maxHp: hp, kind: id % 4, regrow: -1, boss: false })
function arena(gear, crops, tick = 0) {
  const state = createFarm(day)
  Object.assign(state, { position: [50, 50], crops, tick, lastPulse: tick, nextBoss: Infinity, nextWave: Infinity })
  Object.assign(state.gear, gear)
  return state
}
function run(focus = 'drum', routeDay = day) {
  let state = createFarm(routeDay), firstOffer = null, firstUpgrade = null, terminalAt = null
  const frames = [], choices = [], surges = []
  const recipe = RECIPES.find((item) => item.weapon === focus)
  for (let tick = 0; tick < FRAMES && state.hp > 0; tick++) {
    while (state.offered.length) {
      firstOffer ??= [...state.offered]; firstUpgrade ??= tick
      const id = state.offered.includes(focus) && state.gear[focus] < 3 ? focus
        : state.offered.includes(recipe.chip) && state.gear[recipe.chip] < 3 ? recipe.chip : state.offered[0]
      choices.push({ tick, id }); state = chooseTalent(state, id)
      if (evolved(state.gear).includes(focus)) terminalAt ??= tick
    }
    const point = clampPoint(state.position, [50 + 30 * Math.sin(tick / 50), 50 + 25 * Math.cos(tick / 75)])
    const surge = state.charge === 100
    if (surge) surges.push(tick)
    frames.push(point)
    state = stepFarm(state, point, surge).state
  }
  return { state, frames, choices, surges, firstOffer, firstUpgrade, terminalAt }
}

describe('music roguelite farming', () => {
  it('gives a deterministic daily field and rewards the first few seconds', () => {
    expect(createFarm(day)).toEqual(createFarm(day))
    expect(createFarm(day).crops).not.toEqual(createFarm('2026-10-05').crops)
    expect(() => createFarm('2026-02-30')).toThrow()
    let state = createFarm(day)
    const original = structuredClone(state)
    const first = stepFarm(state, state.position)
    expect(state).toEqual(original)
    expect(first.state.harvested).toBeGreaterThan(0)
    expect(first.events.some((event) => event.kind === 'pulse')).toBe(true)
    state = first.state
    for (let tick = 1; !state.offered.length && tick < FPS * 5; tick++) {
      state = stepFarm(state, clampPoint(state.position, [50 + 30 * Math.sin(tick / 50), 50 + 25 * Math.cos(tick / 75)])).state
    }
    expect(state.offered).toHaveLength(3)
    expect(state.tick / FPS).toBeGreaterThan(1)
    expect(state.tick / FPS).toBeLessThan(5)
    expect(new Set(state.offered).size).toBe(3)
    expect(state.offered.every((id) => TALENTS.find((talent) => talent.id === id).kind === 'weapon')).toBe(true)
    expect(stepFarm(state, state.position)).toBeNull()
    expect(chooseTalent(state, 'not-a-weapon')).toBeNull()
  })

  it('limits movement and refuses malformed moves, empty charge and finished rounds', () => {
    const state = createFarm(day)
    expect(clampPoint([50, 50], [1000, -1000])).toEqual([52, 48])
    expect(clampPoint([3, 4], [-100, -100])).toEqual([1, 2])
    for (const point of [null, [], [50], [50, 76, 1], [50.1, 76], [NaN, 76], [50, Infinity], [2, 76], [50, 97], [90, 76]]) {
      expect(stepFarm(state, point)).toBeNull()
    }
    expect(stepFarm(state, state.position, true)).toBeNull()
    expect(stepFarm({ ...state, tick: FRAMES }, state.position)).toBeNull()
  })

  it('rotates starter options across days and keeps the chosen instrument recipe available', () => {
    const seen = new Set()
    for (let date = 1; date <= 10; date++) {
      const state = createFarm(`2026-10-${String(date).padStart(2, '0')}`)
      state.xp = THRESHOLDS[0]
      const offered = stepFarm(state, state.position).state
      offered.offered.forEach((id) => seen.add(id))
      const id = offered.offered[0]
      const partner = TALENTS.find((item) => item.id === id).partner
      let selected = chooseTalent(offered, id)
      for (let level = 1; level < 6; level++) {
        selected.xp = THRESHOLDS[level]
        selected = stepFarm(selected, selected.position).state
        const needed = selected.gear[id] < 3 ? id : partner
        expect(selected.offered).toContain(needed)
        expect(new Set(selected.offered).size).toBe(3)
        expect(selected.offered.every((choice) => selected.gear[choice] < 3)).toBe(true)
        selected = chooseTalent(selected, needed)
      }
      expect(evolved(selected.gear)).toContain(id)
    }
    expect(seen.size).toBe(4)
  })

  it('requires both matching items at level three for every terminal form', () => {
    for (const recipe of RECIPES) {
      const gear = createFarm(day).gear
      gear[recipe.weapon] = 3; gear[recipe.chip] = 2
      expect(evolved(gear)).not.toContain(recipe.weapon)
      gear[recipe.weapon] = 2; gear[recipe.chip] = 3
      expect(evolved(gear)).not.toContain(recipe.weapon)
      gear[recipe.weapon] = 3
      expect(evolved(gear)).toContain(recipe.weapon)
    }
  })

  it('turns drum harvests into wider damaging chain blasts without counting a crop twice', () => {
    const ordinary = arena({ drum: 3, range: 2 }, [crop(0, 50, 50), crop(1, 79, 50, 6)])
    ordinary.lastPulse = -8
    const terminal = structuredClone(ordinary); terminal.gear.range = 3
    const normal = stepFarm(ordinary, ordinary.position)
    const ultimate = stepFarm(terminal, terminal.position)
    expect(normal.state.crops[1].hp).toBe(6)
    expect(ultimate.state.crops[1].hp).toBe(0)
    expect(ultimate.events.find((event) => event.kind === 'blast').radius).toBeGreaterThan(normal.events.find((event) => event.kind === 'blast').radius)
    const dense = arena({ drum: 3, range: 3 }, [crop(0, 50, 50), crop(1, 51, 50), crop(2, 52, 50)])
    dense.lastPulse = -8
    const chain = stepFarm(dense, dense.position)
    expect(chain.state.harvested).toBe(3)
    expect(chain.events.filter((event) => event.kind === 'harvest')).toHaveLength(3)
    expect(chain.events.some((event) => event.chain)).toBe(true)
    expect(dense.crops.every((item) => item.hp === 1)).toBe(true)
  })

  it('evolves guitar from four rotating blades to six with doubled contact damage', () => {
    const ordinary = arena({ orbit: 3, tempo: 2 }, [])
    const [x, y] = orbitPositions(ordinary)[0]
    ordinary.crops = [crop(0, x, y, 20)]
    const terminal = structuredClone(ordinary); terminal.gear.tempo = 3
    expect(orbitPositions(ordinary)).toHaveLength(4)
    expect(orbitPositions(terminal)).toHaveLength(6)
    expect(stepFarm(ordinary, ordinary.position).state.crops[0].hp).toBe(17)
    expect(stepFarm(terminal, terminal.position).state.crops[0].hp).toBe(14)
  })

  it('changes the bass column beam into a wide black hole that pulls remote loot', () => {
    const ordinary = arena({ power: 3, magnet: 2 }, [crop(0, 50, 8, 20), crop(1, 76, 50, 20)])
    ordinary.loot = [{ id: 100, x: 5, y: 5, xp: 7, coins: 8 }]
    const terminal = structuredClone(ordinary); terminal.gear.magnet = 3
    const normal = stepFarm(ordinary, ordinary.position)
    const ultimate = stepFarm(terminal, terminal.position)
    expect(normal.events.some((event) => event.kind === 'beam')).toBe(true)
    expect(normal.state.crops.map((item) => item.hp)).toEqual([16, 20])
    expect(ultimate.events.some((event) => event.kind === 'blackhole')).toBe(true)
    expect(ultimate.events.some((event) => event.kind === 'beam')).toBe(false)
    expect(ultimate.state.crops.map((item) => item.hp)).toEqual([20, 13])
    expect(ultimate.state.loot[0].x).toBeGreaterThan(normal.state.loot[0].x + 20)
  })

  it('lets terminal harp rain hit eight remote crops and preserves already-due rain at high speed', () => {
    const ordinary = arena({ echo: 3, lucky: 2 }, Array.from({ length: 8 }, (_, id) => crop(id, 5 + id * 10, 5, 20)))
    ordinary.echoDue = 0
    const terminal = structuredClone(ordinary); terminal.gear.lucky = 3
    expect(stepFarm(ordinary, ordinary.position).events.filter((event) => event.kind === 'rain')).toHaveLength(0)
    const rain = stepFarm(terminal, terminal.position)
    expect(rain.events.filter((event) => event.kind === 'rain')).toHaveLength(8)
    expect(rain.state.crops.every((item) => item.hp <= 14)).toBe(true)
    const fast = arena({ echo: 1, tempo: 3 }, [crop(1, 50, 25, 20)], 3)
    Object.assign(fast, { echoDue: 3, lastPulse: 0, surgeUntil: 50 })
    const scheduled = stepFarm(fast, fast.position)
    expect(scheduled.events.filter((event) => event.kind === 'rain')).toHaveLength(1)
    expect(scheduled.state.echoDue).toBe(6)
  })

  it('collects experience on pickup, merges drops, and respawns enemies outside the arena', () => {
    const state = arena({ power: 1 }, [crop(0, 50, 8)])
    state.loot = [{ id: 100, x: 50, y: 8, xp: 3, coins: 5 }]
    const result = stepFarm(state, state.position)
    expect(result.state.xp).toBe(0)
    expect(result.state.loot).toHaveLength(1)
    expect(result.state.loot[0]).toMatchObject({ xp: 8, coins: 13 })
    const waiting = { ...result.state, tick: result.state.crops[0].regrow, lastPulse: result.state.crops[0].regrow, gear: { ...result.state.gear, power: 0 } }
    const respawned = stepFarm(waiting, waiting.position).state
    expect(respawned.crops[0].hp).toBeGreaterThan(0)
    expect(Math.hypot(respawned.crops[0].x - 50, respawned.crops[0].y - 50)).toBeGreaterThan(40)
    expect(respawned.harvested).toBe(1)
    const magnetic = { ...waiting, gear: { ...waiting.gear, magnet: 3 } }
    expect(stepFarm(magnetic, magnetic.position).state.loot[0].y).toBeGreaterThan(waiting.loot[0].y)

  })

  it('lets a focused build evolve before forty seconds and preserves exact full-run replay', () => {
    for (const [focus, routeDay] of [['drum', '2026-10-01'], ['orbit', '2026-10-04'], ['power', '2026-10-02'], ['echo', '2026-10-01']]) {
      const round = run(focus, routeDay)
      expect(round.firstOffer).toContain(focus)
      expect(round.terminalAt).toBeLessThan(FPS * 40)
      expect(round.state.bosses).toBeGreaterThanOrEqual(2)
      const replay = replayFarm(routeDay, round.frames, round.choices, round.surges)
      expect(replay).toMatchObject({ score: round.state.score, harvested: round.state.harvested, bosses: round.state.bosses, coins: round.state.coins, xp: round.state.xp, maxCombo: round.state.maxCombo, gear: round.state.gear })
      expect(round.state.loot.length).toBeLessThan(200)
    }
  })

  it('rejects partial or forged replay inputs and unmatched or illegal choices and boosts', () => {
    const round = run('orbit', '2026-10-01')
    const replay = (frames = round.frames, choices = round.choices, surges = round.surges) => replayFarm('2026-10-01', frames, choices, surges)
    expect(replay()).not.toBeNull()
    expect(replay(round.frames.slice(1))).toBeNull()
    expect(replay([[99, 99], ...round.frames.slice(1)])).toBeNull()
    expect(replay(round.frames, [])).toBeNull()
    expect(replay(round.frames, [{ ...round.choices[0], id: 'forged' }, ...round.choices.slice(1)])).toBeNull()
    expect(replay(round.frames, [{ ...round.choices[0], tick: round.choices[0].tick + 1 }, ...round.choices.slice(1)])).toBeNull()
    expect(replay(round.frames, [...round.choices, { tick: FRAMES, id: 'drum' }])).toBeNull()
    for (const surges of [[0], [1, 1], [5, 4], [-1], [FRAMES], [NaN]]) expect(replay(round.frames, round.choices, surges)).toBeNull()
    expect(replayFarm('2026-02-30', round.frames, round.choices, round.surges)).toBeNull()
  })
})
