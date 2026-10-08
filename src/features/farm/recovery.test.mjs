import { describe, expect, it } from 'vitest'
import {
  createFarm,
  stepFarm,
  chooseTalent,
  farmUpgradeXp,
  farmXpThreshold,
  THRESHOLDS,
  TALENTS,
  MAX_GEAR_LEVEL,
  STARTER_CHOICES,
  replayFarm,
  clampPoint,
  XP_QUAD,
} from './rules.mjs'

const quiet = (day = '2026-10-04') => ({
  ...createFarm(day),
  crops: [],
  nextWave: Infinity,
  nextBoss: Infinity,
  nextBass: Infinity,
})

describe('unlimited player levels and recovery cards', () => {
  it('continues the original rounded experience curve without a table-sized limit', () => {
    let total = 0
    for (let level = 0; level < 10000; level++) {
      expect(farmXpThreshold(level)).toBe(total)
      const cost = Math.round(20 + 20 * level + (XP_QUAD / 20) * level ** 2)
      expect(farmUpgradeXp(level)).toBe(cost)
      total += cost
      if (level < THRESHOLDS.length) expect(farmXpThreshold(level + 1)).toBe(THRESHOLDS[level])
    }
    expect(farmXpThreshold(10000)).toBe(total)
  })

  it('randomly mixes a unique healing card into starter and later deals while keeping build choices', () => {
    const seen = { starter: new Set(), later: new Set() }
    for (let date = 1; date <= 31; date++) {
      for (const level of [0, 8]) {
        const state = quiet(`2026-10-${String(date).padStart(2, '0')}`)
        state.level = level
        if (level) state.gear.orbit = 1
        state.xp = farmXpThreshold(level + 1)
        const next = stepFarm(state, state.position).state
        expect(next.offered).toHaveLength(3)
        expect(new Set(next.offered).size).toBe(3)
        seen[level ? 'later' : 'starter'].add(next.offered.includes('heal'))
        if (level) expect(next.offered).toContain('orbit')
        else
          expect(next.offered.filter((id) => id !== 'heal')).toHaveLength(
            next.offered.includes('heal') ? 2 : 3,
          )
        expect(stepFarm(next, next.position)).toBeNull()
      }
    }
    expect([...seen.starter].sort()).toEqual([false, true])
    expect([...seen.later].sort()).toEqual([false, true])
  })

  it('fully heals to the actual health cap without touching gear, XP, rewards or the input state', () => {
    const previous = {
      ...quiet(),
      hp: 7,
      maxHp: 150,
      xp: farmXpThreshold(1) + 9,
      offered: ['heal', 'drum', 'orbit'],
    }
    const saved = structuredClone(previous)
    const next = chooseTalent(previous, 'heal')
    expect(previous).toEqual(saved)
    expect(next).toMatchObject({
      hp: 150,
      maxHp: 150,
      level: 1,
      xp: previous.xp,
      coins: 0,
      score: 0,
      tick: previous.tick,
      offered: [],
    })
    expect(next.gear).toEqual(previous.gear)
    expect(Object.hasOwn(next.gear, 'heal')).toBe(false)
    expect(chooseTalent({ ...previous, offered: ['drum'] }, 'heal')).toBeNull()
    expect(chooseTalent({ ...previous, hp: 0 }, 'heal')).toBeNull()
  })

  it('keeps upgrading with a full loadout far beyond level 51, including full-health choices and XP overflow', () => {
    let state = quiet()
    for (const kind of ['weapon', 'chip'])
      for (const talent of TALENTS.filter((item) => item.kind === kind).slice(0, 5))
        state.gear[talent.id] = MAX_GEAR_LEVEL
    state.level = 50
    state.hp = 1
    state.xp = farmXpThreshold(250) + 9
    state = stepFarm(state, state.position).state
    const originalGear = { ...state.gear },
      tick = state.tick
    for (let index = 0; index < 200; index++) {
      // A dry pool still has to deal a full hand: the healing card always
      // leads, and growth cards fill the rest, so leveling never stalls on an
      // empty deal and never repeats one lone card either.
      expect(state.offered[0]).toBe('heal')
      expect(state.offered).toHaveLength(STARTER_CHOICES)
      state = chooseTalent(state, 'heal')
      expect(state.hp).toBe(100)
      expect(state.gear).toEqual(originalGear)
      expect(state.tick).toBe(tick)
    }
    expect(state.level).toBe(250)
    expect(state.xp - farmXpThreshold(state.level)).toBe(9)
    expect(state.offered).toEqual([])
    expect(stepFarm(state, state.position).state.tick).toBe(tick + 1)
    state.xp = farmXpThreshold(251)
    state = stepFarm(state, state.position).state
    expect(chooseTalent(state, 'heal').level).toBe(251)
  })

  it('replays real randomly dealt healing choices and rejects substituted or extra choices', () => {
    // Only a member's instrument can open a run now, so the run and its
    // replay are both played as the drummer.
    let state = createFarm('2026-10-04', {}, 'bear-drums')
    const frames = [],
      choices = []
    for (let tick = 0; tick < 16 * 600 && state.hp > 0; tick++) {
      while (state.offered.length) {
        const id = state.offered.includes('heal') ? 'heal' : state.offered[0]
        choices.push({ tick: state.tick, id })
        state = chooseTalent(state, id)
      }
      const target = state.crops.find((enemy) => enemy.hp > 0)
      const point = clampPoint(state.position, target ? [target.x, target.y] : state.position)
      frames.push(point)
      state = stepFarm(state, point).state
    }
    expect(state.hp).toBe(0)
    expect(choices.some((choice) => choice.id === 'heal')).toBe(true)
    const round = replayFarm(state.day, frames, choices, [], {}, 'bear-drums')
    expect(round).toMatchObject({ hp: 0, score: state.score, xp: state.xp, gear: state.gear })
    const wrong = choices.map((choice) => ({ ...choice }))
    wrong[0].id = 'missing'
    expect(replayFarm(state.day, frames, wrong)).toBeNull()
    expect(replayFarm(state.day, frames, [...choices, { tick: state.tick, id: 'heal' }])).toBeNull()
  })
})
