import { describe, expect, it } from 'vitest'
import {
  FARM_MODIFIERS,
  FPS,
  MAX_BOSSES,
  MAX_GEAR_LEVEL,
  STARTER_CHOICES,
  RECIPES,
  STAT_CARDS,
  STAT_CARD_DAMAGE,
  STAT_CARD_HP,
  STAT_CARD_STRIDE,
  SURGE_COOLDOWN,
  TALENTS,
  THRESHOLDS,
  activeCombos,
  chooseTalent,
  clampPoint,
  createFarm,
  evolved,
  farmModifier,
  farmMoveStep,
  farmXpThreshold,
  orbitPositions,
  replayFarm,
  stepFarm,
} from './rules.mjs'

const day = '2026-10-04'
// Four minutes is plenty to reach the final form; death is produced by the
// chase tail below, so a longer dodge phase only slows slow CI machines down.
const TEST_TICKS = FPS * 60 * 4
const crop = (id, x, y, hp = 1) => ({
  id,
  x,
  y,
  hp,
  maxHp: hp,
  kind: id % 4,
  regrow: -1,
  boss: false,
})
const boss = (id, hp = 1) => ({ id, x: 50, y: 68, kind: 3, hp, maxHp: hp, regrow: -1, boss: true })
function arena(gear, crops, tick = 0) {
  const state = createFarm(day)
  Object.assign(state, {
    position: [50, 50],
    crops,
    tick,
    lastPulse: tick,
    nextBoss: Infinity,
    nextWave: Infinity,
  })
  Object.assign(state.gear, gear)
  return state
}
// Keep away from the closest monster: healing drops are limited, so a farmer
// that walks straight into the horde dies before the upgrade route is proven.
function evade(state, target) {
  let closest = null,
    nearest = Infinity
  for (const crop of state.crops) {
    if (crop.hp <= 0) continue
    const dist = Math.hypot((crop.x - state.position[0]) * 0.84, crop.y - state.position[1])
    if (dist < nearest) {
      nearest = dist
      closest = crop
    }
  }
  if (!closest || nearest >= 26) return target
  return [
    state.position[0] + (state.position[0] - closest.x) * 2,
    state.position[1] + (state.position[1] - closest.y) * 2,
  ]
}
// Deliberately walk into the nearest monster, used only to end a test run.
function chase(state) {
  let closest = null,
    nearest = Infinity
  for (const crop of state.crops) {
    if (crop.hp <= 0) continue
    const dist = Math.hypot((crop.x - state.position[0]) * 0.84, crop.y - state.position[1])
    if (dist < nearest) {
      nearest = dist
      closest = crop
    }
  }
  return closest ? [closest.x, closest.y] : [...state.position]
}
function run(focus = 'drum', routeDay = day) {
  let state = createFarm(routeDay),
    firstOffer = null,
    firstUpgrade = null,
    terminalAt = null
  const frames = [],
    choices = [],
    surges = []
  const recipe = RECIPES.find((item) => item.weapon === focus)
  for (let tick = 0; tick < TEST_TICKS && state.hp > 0; tick++) {
    while (state.offered.length) {
      firstOffer ??= [...state.offered]
      firstUpgrade ??= tick
      const id =
        state.offered.includes(focus) && state.gear[focus] < MAX_GEAR_LEVEL
          ? focus
          : state.offered.includes(recipe.chip) && state.gear[recipe.chip] < MAX_GEAR_LEVEL
            ? recipe.chip
            : state.offered[0]
      choices.push({ tick, id })
      state = chooseTalent(state, id)
      if (evolved(state.gear).includes(focus)) terminalAt ??= tick
    }
    const point = clampPoint(
      state.position,
      evade(state, [50 + 30 * Math.sin(tick / 50), 50 + 25 * Math.cos(tick / 75)]),
    )
    const surge = state.charge === 100
    if (surge) surges.push(tick)
    frames.push(point)
    state = stepFarm(state, point, surge).state
  }
  // A finished loadout can outlive the dodging route. Walk into the horde so
  // contact damage ends the run: healing is capped, so this always kills, and
  // the replay has a death to verify on every platform.
  while (state.hp > 0 && frames.length < FPS * 60 * 12) {
    while (state.offered.length) {
      const id = state.offered[0]
      choices.push({ tick: state.tick, id })
      state = chooseTalent(state, id)
    }
    const point = clampPoint(state.position, chase(state))
    frames.push(point)
    state = stepFarm(state, point, false).state
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
      state = stepFarm(
        state,
        clampPoint(state.position, [50 + 30 * Math.sin(tick / 50), 50 + 25 * Math.cos(tick / 75)]),
      ).state
    }
    expect(state.offered).toHaveLength(STARTER_CHOICES)
    expect(state.tick / FPS).toBeGreaterThan(1)
    expect(state.tick / FPS).toBeLessThan(5)
    expect(new Set(state.offered).size).toBe(state.offered.length)
    expect(
      state.offered.every(
        (id) => id === 'heal' || TALENTS.find((talent) => talent.id === id).kind === 'weapon',
      ),
    ).toBe(true)
    expect(stepFarm(state, state.position)).toBeNull()
    expect(chooseTalent(state, 'not-a-weapon')).toBeNull()
  })

  it('never mutates the state it was given, even with lingering trails', () => {
    let state = arena({ whistle: 3, delay: 3 }, [], 100)
    state.nextWave = 100
    let previous = structuredClone(state)
    for (let tick = 0; tick < 40; tick++) {
      const result = stepFarm(
        state,
        clampPoint(state.position, [50 + Math.sin(tick / 3) * 3, 50 + Math.cos(tick / 3) * 3]),
      )
      expect(result).not.toBeNull()
      expect(state).toEqual(previous)
      state = result.state
      previous = structuredClone(state)
    }
    expect(state.trails.length).toBeGreaterThan(0)
    expect(state.trails.length).toBeLessThanOrEqual(30)
  })
  it('limits movement and refuses malformed moves, empty charge and finished rounds', () => {
    const state = createFarm(day)
    expect(clampPoint([50, 50], [1000, -1000])).toEqual([52, 48])
    expect(clampPoint([3, 4], [-100, -100])).toEqual([1, 2])
    for (const point of [
      null,
      [],
      [50],
      [50, 76, 1],
      [50.1, 76],
      [NaN, 76],
      [50, Infinity],
      [2, 76],
      [50, 97],
      [90, 76],
    ]) {
      expect(stepFarm(state, point)).toBeNull()
    }
    expect(stepFarm(state, state.position, true)).toBeNull()
    expect(stepFarm({ ...state, hp: 0 }, state.position)).toBeNull()
  })

  it('spaces surges out by a tick-counted cooldown and keeps a spammed button replayable', () => {
    const charged = { ...arena({}, [], 0), charge: 100 }
    const fired = stepFarm(charged, charged.position, true).state
    expect(fired).toMatchObject({ charge: 0, surgeUntil: FPS * 3, nextSurge: SURGE_COOLDOWN })
    // The wait is measured in ticks, never in wall-clock time, so a replay of
    // the same run reaches the same verdict on any machine.
    const waiting = { ...fired, tick: SURGE_COOLDOWN - 1, charge: 100 }
    // A surge asked for during the cooldown is dropped, not rejected: a replay
    // that holds the button down still has to verify instead of failing the
    // whole round, and the charge stays banked for the tick it unlocks on.
    const spammed = stepFarm(waiting, waiting.position, true)
    expect(spammed).not.toBeNull()
    expect(spammed.state).toMatchObject({
      charge: 100,
      nextSurge: SURGE_COOLDOWN,
      surgeUntil: FPS * 3,
    })
    expect(
      stepFarm({ ...waiting, tick: SURGE_COOLDOWN }, waiting.position, true).state,
    ).toMatchObject({ charge: 0, nextSurge: SURGE_COOLDOWN * 2 })
    // A new run starts with the button live again.
    expect(createFarm(day).nextSurge).toBe(0)
  })

  it('grows the run itself once every instrument and chip is maxed, and only that run', () => {
    // Regression guard: growth cards have to move the numbers the player can
    // feel, not just sit in the hand as a fourth flavour of level up.
    const dryHand = () => {
      const state = arena({}, [], 0)
      for (const talent of TALENTS) state.gear[talent.id] = MAX_GEAR_LEVEL
      state.level = 50
      state.hp = 40
      state.xp = farmXpThreshold(51)
      return stepFarm(state, state.position).state
    }
    const dealt = (state) => {
      let running = {
        ...state,
        offered: [],
        crops: [{ id: 1, x: 53, y: 76, hp: 1e6, maxHp: 1e6, kind: 0, regrow: -1, boss: false }],
      }
      for (let tick = 0; tick < 96; tick++) running = stepFarm(running, running.position).state
      return 1e6 - running.crops[0].hp
    }
    const hand = dryHand()
    expect(hand.offered[0]).toBe('heal')
    expect(hand.offered).toHaveLength(STARTER_CHOICES)
    expect(hand.offered.slice(1).every((id) => STAT_CARDS.some((card) => card.id === id))).toBe(
      true,
    )
    // Spending the level any other way leaves the rest of the run identical,
    // so the healing pick is the baseline the growth cards are measured against.
    const pick = (id) => chooseTalent({ ...hand, offered: [id] }, id)
    const plain = pick('heal')
    // Vigor widens the cap and pays the same amount back at once, so the card
    // never reads as doing nothing until the next healing drop happens to land.
    const vigor = pick('vigor')
    expect(vigor.maxHp).toBe(hand.maxHp + STAT_CARD_HP)
    expect(vigor.hp).toBe(hand.hp + STAT_CARD_HP)
    // Footwork lengthens the step the movement check actually allows.
    expect(farmMoveStep(pick('footwork')) / farmMoveStep(plain)).toBeCloseTo(
      1 + STAT_CARD_STRIDE,
      5,
    )
    // Overload makes every hit land harder, the surge included, because both
    // run through the same damage path.
    expect(dealt(pick('overdrive')) / dealt(plain)).toBeCloseTo(1 + STAT_CARD_DAMAGE, 2)
    // Growth belongs to the run: the next one starts from zero again.
    expect(createFarm(day).growth).toEqual({ hp: 0, power: 0, stride: 0 })
  })

  it('rotates starter options across days and keeps the chosen instrument recipe available', () => {
    const seen = new Set()
    for (let date = 1; date <= 10; date++) {
      const state = createFarm(`2026-10-${String(date).padStart(2, '0')}`)
      state.xp = THRESHOLDS[0]
      const offered = stepFarm(state, state.position).state
      offered.offered.filter((id) => id !== 'heal').forEach((id) => seen.add(id))
      const id = offered.offered[0]
      const partner = TALENTS.find((item) => item.id === id).partner
      let selected = chooseTalent(offered, id)
      for (let level = 1; level < MAX_GEAR_LEVEL * 2; level++) {
        selected.xp = THRESHOLDS[level]
        selected = stepFarm(selected, selected.position).state
        const needed = selected.gear[id] < MAX_GEAR_LEVEL ? id : partner
        expect(selected.offered).toContain(needed)
        expect(new Set(selected.offered).size).toBe(3)
        expect(
          selected.offered.every(
            (choice) => choice === 'heal' || selected.gear[choice] < MAX_GEAR_LEVEL,
          ),
        ).toBe(true)
        selected = chooseTalent(selected, needed)
      }
      expect(evolved(selected.gear)).toContain(id)
    }
    expect(seen.size).toBe(TALENTS.filter((talent) => talent.kind === 'weapon').length)
  })

  it('requires both matching items at the top level for every terminal form', () => {
    for (const recipe of RECIPES) {
      const gear = createFarm(day).gear
      gear[recipe.weapon] = MAX_GEAR_LEVEL
      gear[recipe.chip] = MAX_GEAR_LEVEL - 1
      expect(evolved(gear)).not.toContain(recipe.weapon)
      gear[recipe.weapon] = MAX_GEAR_LEVEL - 1
      gear[recipe.chip] = MAX_GEAR_LEVEL
      expect(evolved(gear)).not.toContain(recipe.weapon)
      gear[recipe.weapon] = MAX_GEAR_LEVEL
      expect(evolved(gear)).toContain(recipe.weapon)
    }
  })

  it('turns drum harvests into wider damaging chain blasts without counting a crop twice', () => {
    const ordinary = arena({ drum: MAX_GEAR_LEVEL, range: MAX_GEAR_LEVEL - 1 }, [
      crop(0, 50, 50),
      crop(1, 79, 50, 6),
    ])
    ordinary.lastPulse = -8
    const terminal = structuredClone(ordinary)
    terminal.gear.range = MAX_GEAR_LEVEL
    const normal = stepFarm(ordinary, ordinary.position)
    const ultimate = stepFarm(terminal, terminal.position)
    expect(normal.state.crops[1].hp).toBe(5)
    expect(ultimate.state.crops[1].hp).toBe(0)
    expect(ultimate.events.find((event) => event.kind === 'blast').radius).toBeGreaterThan(
      normal.events.find((event) => event.kind === 'blast').radius,
    )
    const dense = arena({ drum: MAX_GEAR_LEVEL, range: MAX_GEAR_LEVEL }, [
      crop(0, 50, 50),
      crop(1, 51, 50),
      crop(2, 52, 50),
    ])
    dense.lastPulse = -8
    const chain = stepFarm(dense, dense.position)
    expect(chain.state.harvested).toBe(3)
    expect(chain.events.filter((event) => event.kind === 'harvest')).toHaveLength(3)
    expect(chain.events.some((event) => event.chain)).toBe(true)
    expect(dense.crops.every((item) => item.hp === 1)).toBe(true)
  })

  it('evolves guitar to eight rotating blades with doubled contact damage', () => {
    const ordinary = arena({ orbit: MAX_GEAR_LEVEL, tempo: MAX_GEAR_LEVEL - 1 }, [])
    const [x, y] = orbitPositions(ordinary)[0]
    ordinary.crops = [crop(0, x, y, 20)]
    const terminal = structuredClone(ordinary)
    terminal.gear.tempo = MAX_GEAR_LEVEL
    expect(orbitPositions(ordinary)).toHaveLength(6)
    expect(orbitPositions(terminal)).toHaveLength(8)
    expect(stepFarm(ordinary, ordinary.position).state.crops[0].hp).toBe(15)
    expect(stepFarm(terminal, terminal.position).state.crops[0].hp).toBe(10)
  })

  it('changes the bass column beam into a wide black hole that pulls remote loot', () => {
    const ordinary = arena({ power: MAX_GEAR_LEVEL, magnet: MAX_GEAR_LEVEL - 1 }, [
      crop(0, 50, 8, 20),
      crop(1, 76, 50, 20),
    ])
    ordinary.loot = [{ id: 100, x: 5, y: 5, xp: 7, coins: 8 }]
    const terminal = structuredClone(ordinary)
    terminal.gear.magnet = MAX_GEAR_LEVEL
    const normal = stepFarm(ordinary, ordinary.position)
    const ultimate = stepFarm(terminal, terminal.position)
    expect(normal.events.some((event) => event.kind === 'beam')).toBe(true)
    expect(normal.state.crops.map((item) => item.hp)).toEqual([14, 20])
    expect(ultimate.events.some((event) => event.kind === 'blackhole')).toBe(true)
    expect(ultimate.events.some((event) => event.kind === 'beam')).toBe(false)
    expect(ultimate.state.crops.map((item) => item.hp)).toEqual([20, 11])
    expect(ultimate.state.loot[0].x).toBeGreaterThan(normal.state.loot[0].x + 20)
  })

  it('lets terminal harp rain hit eight remote crops and preserves already-due rain at high speed', () => {
    const ordinary = arena(
      { echo: MAX_GEAR_LEVEL, lucky: MAX_GEAR_LEVEL - 1 },
      Array.from({ length: 8 }, (_, id) => crop(id, 5 + id * 10, 5, 20)),
    )
    ordinary.echoDue = 0
    const terminal = structuredClone(ordinary)
    terminal.gear.lucky = MAX_GEAR_LEVEL
    expect(
      stepFarm(ordinary, ordinary.position).events.filter((event) => event.kind === 'rain'),
    ).toHaveLength(0)
    const rain = stepFarm(terminal, terminal.position)
    expect(rain.events.filter((event) => event.kind === 'rain')).toHaveLength(8)
    expect(rain.state.crops.every((item) => item.hp <= 14)).toBe(true)
    const fast = arena({ echo: 1, tempo: MAX_GEAR_LEVEL }, [crop(1, 50, 25, 20)], 3)
    Object.assign(fast, { echoDue: 3, lastPulse: 0, surgeUntil: 50 })
    const scheduled = stepFarm(fast, fast.position)
    expect(scheduled.events.filter((event) => event.kind === 'rain')).toHaveLength(1)
    expect(scheduled.state.echoDue).toBe(6)
  })

  it('collects experience on pickup, merges drops, and respawns enemies outside the arena', () => {
    const state = arena({ power: 1 }, [crop(0, 50, 8)])
    const reward = FARM_MODIFIERS.find((item) => item.id === state.modifier)?.reward ?? 1
    state.loot = [{ id: 100, x: 50, y: 8, xp: 3, coins: 5 }]
    const result = stepFarm(state, state.position)
    expect(result.state.xp).toBe(0)
    expect(result.state.loot).toHaveLength(1)
    expect(result.state.loot[0]).toMatchObject({
      xp: 3 + Math.round(5 * reward),
      coins: 5 + Math.round(8 * reward),
    })
    const waiting = {
      ...result.state,
      tick: result.state.crops[0].regrow,
      lastPulse: result.state.crops[0].regrow,
      gear: { ...result.state.gear, power: 0 },
    }
    const respawned = stepFarm(waiting, waiting.position).state
    expect(respawned.crops[0].hp).toBeGreaterThan(0)
    expect(Math.hypot(respawned.crops[0].x - 50, respawned.crops[0].y - 50)).toBeGreaterThan(40)
    expect(respawned.harvested).toBe(1)
    const magnetic = { ...waiting, gear: { ...waiting.gear, magnet: MAX_GEAR_LEVEL } }
    expect(stepFarm(magnetic, magnetic.position).state.loot[0].y).toBeGreaterThan(waiting.loot[0].y)
  })

  it('gives every day one shared modifier that reshapes waves, health, speed or rewards', () => {
    const quiet = (extra = {}) => ({
      ...arena({}, [], 100),
      nextWave: Infinity,
      nextBoss: Infinity,
      nextBass: Infinity,
      ...extra,
    })
    const wave = (id) => {
      const s = quiet({ modifier: id, nextWave: 100 })
      return stepFarm(s, s.position).state.crops.length
    }
    expect(wave('swarm')).toBeGreaterThan(wave('calm'))
    expect(wave('nonsense')).toBe(3)
    const health = (id) => {
      const s = quiet({ modifier: id, nextWave: 100 })
      return stepFarm(s, s.position).state.crops[0].maxHp
    }
    expect(health('tough')).toBe(health('calm') + 1)
    const chase = (id) => {
      const s = quiet({
        modifier: id,
        crops: [{ id: 1, x: 10, y: 50, kind: 0, hp: 50, maxHp: 50, regrow: -1, boss: false }],
      })
      return stepFarm(s, s.position).state.crops[0].x
    }
    expect(chase('swift')).toBeGreaterThan(chase('calm'))
    const coins = (id) => {
      const s = quiet({ modifier: id, lastPulse: 80, crops: [crop(0, 50, 58)] })
      return stepFarm(s, s.position).state.loot.reduce((sum, drop) => sum + drop.coins, 0)
    }
    expect(coins('golden')).toBeGreaterThan(coins('calm'))
    expect(createFarm('2026-10-04').modifier).toBe(farmModifier('2026-10-04').id)
    expect(createFarm('2026-10-01').nextBoss).toBe(120 * FPS)
    const days = new Set()
    for (let index = 0; index < 60; index++)
      days.add(farmModifier(`2026-11-${String((index % 28) + 1).padStart(2, '0')}`).id)
    expect(days.size).toBeGreaterThan(1)
    for (const id of days) expect(FARM_MODIFIERS.some((item) => item.id === id)).toBe(true)
  })
  it('keeps a boss slot free for a bass arrival that is due on the same tick', () => {
    const interval = 240 * FPS
    const start = 480 * FPS
    const state = arena(
      {},
      [1, 2, 3].map((id) => boss(id)),
      start,
    )
    state.nextBoss = start
    state.nextBass = start
    const shared = stepFarm(state, state.position).state
    // The drum boss stands down so the bass can land: both timers were due and
    // only one slot was left below the cap.
    expect(shared.crops.filter((crop) => crop.bass)).toHaveLength(1)
    expect(shared.crops.filter((crop) => crop.boss)).toHaveLength(MAX_BOSSES)
    expect(shared.nextBass).toBe(start + interval)
  })

  it('gives an elite a clean state when it takes over a dead monster slot', () => {
    const tick = 45 * FPS
    const state = arena(
      {},
      [
        {
          id: 1,
          x: 50,
          y: 68,
          kind: 0,
          hp: 0,
          maxHp: 1,
          // Far future: the slot stays dead so the elite can claim it.
          regrow: tick + 1000,
          boss: false,
          slowUntil: tick + 100,
          dashUntil: tick + 100,
        },
      ],
      tick,
    )
    const next = stepFarm(state, state.position).state
    expect(next.crops[0].elite).toBe(true)
    expect(next.crops[0].hp).toBeGreaterThan(0)
    expect(next.crops[0].slowUntil).toBe(-1)
    expect(next.crops[0].dashUntil).toBe(-1)
  })

  it('clears the slow of a dead monster before it regrows into a fresh one', () => {
    const tick = 30 * FPS
    const state = arena(
      {},
      [
        {
          id: 1,
          x: 50,
          y: 68,
          kind: 0,
          hp: 0,
          maxHp: 1,
          regrow: tick,
          boss: false,
          slowUntil: tick + 100,
          dashUntil: tick + 100,
        },
      ],
      tick,
    )
    const next = stepFarm(state, state.position).state
    expect(next.crops[0].hp).toBeGreaterThan(0)
    expect(next.crops[0].elite).toBe(false)
    expect(next.crops[0].slowUntil).toBe(-1)
    expect(next.crops[0].dashUntil).toBe(-1)
  })

  it('lets elites, shields and bosses actually show up during a wandering run', () => {
    // Regression guard: these mechanics are gated by timers and by the monster
    // pool, so a small refactor can silently make them never fire.
    let state = createFarm(day)
    const dodge = (current) => {
      let closest = null,
        nearest = Infinity
      for (const crop of current.crops) {
        if (crop.hp <= 0) continue
        const distance = Math.hypot(
          (crop.x - current.position[0]) * 0.84,
          crop.y - current.position[1],
        )
        if (distance < nearest) {
          nearest = distance
          closest = crop
        }
      }
      return closest && nearest < 26
        ? [
            current.position[0] + (current.position[0] - closest.x) * 2,
            current.position[1] + (current.position[1] - closest.y) * 2,
          ]
        : [50 + 30 * Math.sin(current.tick / 50), 50 + 25 * Math.cos(current.tick / 75)]
    }
    for (let tick = 0; tick < FPS * 240 && state.hp > 0; tick++) {
      state.hp = state.maxHp
      while (state.offered.length) state = chooseTalent(state, state.offered[0])
      state = stepFarm(state, clampPoint(state.position, dodge(state))).state
    }
    expect(state.tick).toBeGreaterThan(FPS * 119)
    expect(state.elites).toBeGreaterThan(0)
    expect(state.maxShields).toBeGreaterThan(0)
    expect(state.blocks).toBeGreaterThan(0)
    expect(state.bosses).toBeGreaterThan(0)
  }, 60000)
  it('lets a focused build evolve early on every daily modifier and preserves exact full-run replay', () => {
    for (const [focus, routeDay] of [
      ['drum', '2026-10-01'],
      ['orbit', '2026-10-04'],
      ['power', '2026-10-02'],
      ['echo', '2026-10-01'],
    ]) {
      const round = run(focus, routeDay)
      expect(round.state.gear[focus]).toBe(MAX_GEAR_LEVEL)
      // Combat uses sin/cos/hypot, whose last bits differ across platforms, so
      // a ten-minute run diverges between arm64 and x86_64. Assert the pacing
      // with a margin that survives those differences.
      expect(round.terminalAt).toBeLessThan(FPS * 150)
      expect(round.state.tick).toBeGreaterThan(FPS * 20)
      expect(round.choices).toHaveLength(round.state.level)
      if (focus === 'drum') expect(round.choices.length).toBeGreaterThan(50)
      const replay = replayFarm(routeDay, round.frames, round.choices, round.surges)
      expect(replay).toMatchObject({
        score: round.state.score,
        harvested: round.state.harvested,
        bosses: round.state.bosses,
        coins: round.state.coins,
        xp: round.state.xp,
        maxCombo: round.state.maxCombo,
        gear: round.state.gear,
      })
      expect(round.state.hp).toBe(0)
      expect(round.state.loot.length).toBeLessThanOrEqual(600)
    }
  }, 120000)

  it('replays a run that leans on cross-school combos to the same score', () => {
    // Regression guard: combos fire off nothing but the gear table, so a run
    // that reaches several evolutions has to stay frame-for-frame reproducible.
    const round = run('echo', '2026-10-01')
    const combos = activeCombos(round.state.gear)
    expect(combos.length).toBeGreaterThan(1)
    expect(evolved(round.state.gear).length).toBeGreaterThanOrEqual(3)
    const replay = replayFarm('2026-10-01', round.frames, round.choices, round.surges)
    expect(replay).toMatchObject({
      score: round.state.score,
      harvested: round.state.harvested,
      bosses: round.state.bosses,
      coins: round.state.coins,
      xp: round.state.xp,
      gear: round.state.gear,
    })
    expect(activeCombos(replay.gear)).toEqual(combos)
    expect(replayFarm('2026-10-01', round.frames, round.choices, round.surges)).toEqual(replay)
  }, 120000)

  it('rejects partial or forged replay inputs and unmatched or illegal choices and boosts', () => {
    const round = run('orbit', '2026-10-01')
    const replay = (frames = round.frames, choices = round.choices, surges = round.surges) =>
      replayFarm('2026-10-01', frames, choices, surges)
    expect(replay()).not.toBeNull()
    expect(replay(round.frames.slice(1))).toBeNull()
    expect(replay([[99, 99], ...round.frames.slice(1)])).toBeNull()
    expect(replay(round.frames, [])).toBeNull()
    expect(
      replay(round.frames, [{ ...round.choices[0], id: 'forged' }, ...round.choices.slice(1)]),
    ).toBeNull()
    expect(
      replay(round.frames, [
        { ...round.choices[0], tick: round.choices[0].tick + 1 },
        ...round.choices.slice(1),
      ]),
    ).toBeNull()
    expect(
      replay(round.frames, [...round.choices, { tick: round.frames.length, id: 'drum' }]),
    ).toBeNull()
    for (const surges of [[0], [1, 1], [5, 4], [-1], [round.frames.length], [NaN]])
      expect(replay(round.frames, round.choices, surges)).toBeNull()
    expect(replayFarm('2026-02-30', round.frames, round.choices, round.surges)).toBeNull()
  }, 120000)
})
