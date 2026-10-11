import { describe, expect, it } from 'vitest'
import {
  DRUM_ECHO_KILLS_PER_DAMAGE,
  ECHO_INTERVAL,
  chooseTalent,
  createFarm,
  drumEchoStats,
  finishFarm,
  replayFarm,
  stepFarm,
} from './rules.mjs'

const day = '2026-10-04'
const crop = (id, hp = 100, x = 70, extra = {}) => ({
  id,
  x,
  y: 50,
  hp,
  maxHp: hp,
  kind: 0,
  boss: false,
  regrow: -1,
  attackUntil: Infinity,
  ...extra,
})
const field = (drum = 5, crops = []) => {
  const state = createFarm(day)
  Object.assign(state, {
    crops,
    position: [50, 50],
    nextWave: Infinity,
    nextBoss: Infinity,
    nextBass: Infinity,
    hurtUntil: Infinity,
  })
  state.gear.drum = drum
  return state
}
const bleeding = (id, hp = 3, extra = {}) =>
  crop(id, hp, 70, {
    echo: true,
    echoNext: 1,
    echoInterval: 8,
    ...extra,
  })

describe('drum echo stats', () => {
  it.each([
    [0, 0, 16],
    [1, 1, 16],
    [2, 1, 12],
    [3, 2, 12],
    [4, 2, 8],
    [5, 3, 8],
  ])('reports level %i damage %i and interval %i', (level, damage, interval) => {
    expect(drumEchoStats(field(level))).toEqual({
      damage,
      interval,
      kills: 0,
      bonus: 0,
      remaining: 100,
    })
    expect(drumEchoStats(field(level).gear).damage).toBe(damage)
  })

  it.each([
    [0, 0, 100],
    [99, 0, 1],
    [100, 1, 100],
    [199, 1, 1],
    [200, 2, 100],
  ])('uses the exact growth boundary at %i kills', (kills, bonus, remaining) => {
    const state = field()
    state.drumEchoKills = kills
    expect(drumEchoStats(state)).toEqual({
      damage: 3 + bonus,
      interval: 8,
      kills,
      bonus,
      remaining,
    })
  })

  it('doubles only the evolved base and keeps accumulated kills', () => {
    const state = field()
    state.drumEchoKills = 300
    state.gear.range = 4
    state.offered = ['range']
    const evolved = chooseTalent(state, 'range')
    expect(evolved.drumEchoKills).toBe(300)
    expect(drumEchoStats(evolved).damage).toBe(9)
    expect(drumEchoStats(evolved).bonus).toBe(3)
    expect(DRUM_ECHO_KILLS_PER_DAMAGE).toBe(100)
    expect(ECHO_INTERVAL).toBe(16)
  })
})

describe('drum target and rhythm', () => {
  it('targets beyond the old range and skips dead or spawn-protected monsters', () => {
    const state = field(1, [
      crop(1, 0, 51, { regrow: Infinity }),
      crop(2, 100, 52, { spawnAt: 12 }),
      crop(3, 100, 190),
    ])
    const result = stepFarm(state, state.position)
    expect(result.state.crops[1].echo).toBeUndefined()
    expect(result.state.crops[2].echo).toBe(true)
    expect(result.events.find((event) => event.kind === 'echo').x).toBe(190)
  })

  it('can target the nearest infected monster without switching to a farther uninfected one', () => {
    const state = field(1, [
      crop(1, 100, 70, { echo: true, echoNext: 16, echoInterval: 16 }),
      crop(2, 100, 120),
    ])
    const result = stepFarm(state, state.position)
    expect(result.events.find((event) => event.kind === 'echo').x).toBe(70)
    expect(result.state.crops[0].echoNext).toBe(16)
    expect(result.state.crops[1].echo).toBeUndefined()
  })

  it('adds two units of spread and surge radius per speaker level', () => {
    const radii = (range) => {
      const state = field(1, [crop(1)])
      state.gear.range = range
      state.charge = 100
      return stepFarm(state, state.position, true).events
    }
    const plain = radii(0)
    const boosted = radii(1)
    for (const kind of ['echo', 'surge'])
      expect(
        boosted.find((event) => event.kind === kind).radius -
          plain.find((event) => event.kind === kind).radius,
      ).toBe(2)
  })

  it('accelerates an already infected monster after upgrading without restarting its clock', () => {
    let state = stepFarm(field(1, [crop(1)]), [50, 50]).state
    while (state.tick < 4) state = stepFarm(state, state.position).state
    state.offered = ['drum']
    state = chooseTalent(state, 'drum')
    state = stepFarm(state, state.position).state
    expect(state.crops[0].echoNext).toBe(12)
    while (state.tick <= 12) state = stepFarm(state, state.position).state
    expect(state.crops[0].hp).toBe(99)
    expect(state.crops[0].echoNext).toBe(24)
  })

  it('does not postpone a due tick when a new drum beat lands on the same frame', () => {
    const state = field(5, [bleeding(1, 100, { echoNext: 8 })])
    state.tick = 8
    state.gear.tempo = 5 // Kit beat every four frames; echo ticks every eight.
    const result = stepFarm(state, state.position)
    expect(result.state.crops[0].hp).toBe(97)
    expect(result.state.crops[0].echoNext).toBe(16)
  })
})

describe('drum killing-blow growth', () => {
  it('counts the hundredth echo kill and applies the new bonus to subsequent ticks', () => {
    const state = field(5, [bleeding(1), bleeding(2, 10)])
    state.tick = 1
    state.drumEchoKills = 99
    const result = stepFarm(state, state.position).state
    expect(result.drumEchoKills).toBe(100)
    expect(result.crops[1].hp).toBe(6)
    expect(drumEchoStats(result).damage).toBe(4)
  })

  it('never credits another instrument or surge for killing an infected monster', () => {
    for (const attack of ['echo', 'surge']) {
      const state = field(5, [bleeding(1, 1, { echoNext: 8 })])
      if (attack === 'echo') state.gear.echo = 1
      else state.charge = 100
      const result = stepFarm(state, state.position, attack === 'surge').state
      expect(result.harvested).toBe(1)
      expect(result.drumEchoKills).toBe(0)
    }
  })

  it('does not retroactively credit kills before level five', () => {
    const state = field(4, [bleeding(1, 2)])
    state.tick = 1
    const killed = stepFarm(state, state.position).state
    expect(killed.harvested).toBe(1)
    expect(killed.drumEchoKills).toBe(0)
    killed.offered = ['drum']
    expect(chooseTalent(killed, 'drum').drumEchoKills).toBe(0)
  })

  it('credits elite and boss echo kills once and resets growth for a new run', () => {
    const state = field(5, [bleeding(1, 3, { elite: true }), bleeding(2, 3, { boss: true })])
    state.tick = 1
    const result = stepFarm(state, state.position).state
    expect(result.drumEchoKills).toBe(2)
    expect(result.elites).toBe(1)
    expect(result.bosses).toBe(1)
    expect(stepFarm(result, result.position).state.drumEchoKills).toBe(2)
    result.hp = 0
    expect(finishFarm(result, [], [], []).drumEchoKills).toBe(2)
    expect(createFarm(day).drumEchoKills).toBe(0)
  })

  it('replays drum growth and the final round deterministically from real inputs', () => {
    let state = createFarm(day, {}, 'bear-drums')
    const frames = [],
      choices = []
    for (let tick = 0; tick < 16 * 600 && state.hp > 0; tick++) {
      while (state.offered.length) {
        const id = state.offered[0]
        choices.push({ tick: state.tick, id })
        state = chooseTalent(state, id)
      }
      frames.push([...state.position])
      state = stepFarm(state, state.position).state
    }
    expect(state.hp).toBe(0)
    expect(state.gear.drum).toBe(5)
    expect(state.drumEchoKills).toBeGreaterThanOrEqual(DRUM_ECHO_KILLS_PER_DAMAGE)
    expect(replayFarm(day, frames, choices, [], {}, 'bear-drums')).toEqual(
      finishFarm(state, frames, choices, []),
    )
  })
})
