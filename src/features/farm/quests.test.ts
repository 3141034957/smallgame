import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyFarmQuests,
  farmQuestDone,
  farmQuests,
  farmQuestProgress,
  loadFarmQuests,
  FARM_QUEST_KEY,
} from './quests'
import { FARM_PROFILE_KEY } from './characters'
import { loadFarmProfile } from './characters'
import { TALENTS } from './rules.mjs'
import type { FarmRound } from './rules.mjs'

const day = '2026-10-04'
const emptyGear = () =>
  Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])) as FarmRound['gear']
const round = (patch: Partial<FarmRound> = {}): FarmRound => ({
  day,
  frames: [[50, 76]],
  choices: [],
  surges: [],
  outcome: 'defeated',
  hp: 0,
  seconds: 30,
  score: 100,
  maxCombo: 5,
  harvested: 10,
  bosses: 0,
  elites: 0,
  blocks: 0,
  maxShields: 0,
  coins: 20,
  xp: 30,
  stars: 1,
  gear: emptyGear(),
  ...patch,
})

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('daily survivor quests', () => {
  it('gives every day the same three goals and starts at zero', () => {
    expect(farmQuests(day)).toEqual(farmQuests(day))
    expect(farmQuests(day)).toHaveLength(3)
    expect(new Set(farmQuests(day).map((quest) => quest.id)).size).toBe(3)
    expect(farmQuests('2026-10-05').map((quest) => quest.id)).not.toEqual(
      farmQuests(day).map((quest) => quest.id),
    )
    const log = loadFarmQuests(day)
    for (const quest of farmQuests(day)) {
      expect(farmQuestProgress(quest, log)).toBe(0)
      expect(farmQuestDone(quest, log)).toBe(false)
    }
  })
  it('tracks single-run bests and daily totals, and pays each goal once', () => {
    const quests = farmQuests(day)
    const totalQuest = quests.find((quest) => quest.kind === 'total')!
    const bestQuest = quests.find((quest) => quest.kind === 'best')!
    const patch = (value: number): Partial<FarmRound> => ({
      harvested: value,
      bosses: value,
      seconds: value,
      score: value,
      maxCombo: value,
    })
    const first = applyFarmQuests(day, round(patch(3)))
    expect(farmQuestProgress(totalQuest, first.log)).toBe(3)
    expect(farmQuestProgress(bestQuest, first.log)).toBe(3)
    const second = applyFarmQuests(day, round(patch(1)))
    expect(farmQuestProgress(totalQuest, second.log)).toBe(4)
    expect(farmQuestProgress(bestQuest, second.log)).toBe(3)
    const finished = applyFarmQuests(day, round(patch(999)))
    expect(finished.completed.length).toBeGreaterThan(0)
    expect(finished.log.claimed).toEqual(finished.completed)
    expect(loadFarmProfile().coins).toBeGreaterThan(0)
    const repeat = applyFarmQuests(day, round(patch(999)))
    expect(repeat.completed).toEqual([])
    expect(repeat.log.claimed).toEqual(finished.log.claimed)
    expect(loadFarmQuests(day).day).toBe(day)
  })
  it('never announces a goal that the wallet did not actually pay', () => {
    const paid = {
      coins: 99999,
      owned: ['steampunk'],
      selected: 'steampunk',
      rewardedRuns: [
        'quest:2026-10-04:harvest',
        'quest:2026-10-04:hunt',
        'quest:2026-10-04:long',
        'quest:2026-10-04:band',
        'quest:2026-10-04:combo',
        'quest:2026-10-04:score',
      ],
    }
    data.set(FARM_PROFILE_KEY, JSON.stringify(paid))
    const finished = round({
      harvested: 9999,
      bosses: 99,
      seconds: 9999,
      maxCombo: 999,
      score: 999999,
      gear: { ...round().gear, drum: 3, range: 3, orbit: 3, tempo: 3 },
    })
    const result = applyFarmQuests(day, finished)
    // Already rewarded under those ids, so nothing new may be announced.
    expect(result.completed).toEqual([])
    expect(result.error).toBeUndefined()
  })
  it('starts over on a new day and survives corrupt saves', () => {
    applyFarmQuests(day, round({ harvested: 50 }))
    expect(loadFarmQuests('2026-10-05').total).toEqual({})
    data.set(FARM_QUEST_KEY, '{broken')
    expect(loadFarmQuests(day).claimed).toEqual([])
    data.set(
      FARM_QUEST_KEY,
      JSON.stringify({ day, best: { hunt: -4 }, total: { hunt: 'x' }, claimed: [1, 'hunt'] }),
    )
    const log = loadFarmQuests(day)
    expect(log.best.hunt).toBe(0)
    expect(log.total.hunt).toBe(0)
    expect(log.claimed).toEqual(['hunt'])
  })
  it('counts a retried run once but accumulates distinct runs', () => {
    const finished = round({ bosses: 3 })
    const first = applyFarmQuests(day, finished, 'run-1')
    const retry = applyFarmQuests(day, finished, 'run-1')
    expect(retry.log.total).toEqual(first.log.total)
    expect(loadFarmProfile().coins).toBe(0)
    const second = applyFarmQuests(day, finished, 'run-2')
    expect(second.log.total.hunt).toBe(6)
    expect(second.completed).toContain('hunt')
    expect(loadFarmProfile().coins).toBe(400)
  })
  it('retries a failed wallet payment without increasing progress', () => {
    const setItem = (key: string, value: string) => {
      if (key === FARM_PROFILE_KEY) throw new Error('quota')
      data.set(key, value)
    }
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem })
    const finished = round({ bosses: 6 })
    const failed = applyFarmQuests(day, finished, 'run-1')
    expect(failed.error).toBeTruthy()
    expect(failed.completed).toEqual([])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    })
    const retry = applyFarmQuests(day, finished, 'run-1')
    expect(retry.log.total.hunt).toBe(6)
    expect(retry.completed).toEqual(['hunt'])
    expect(loadFarmProfile().coins).toBe(400)
  })
  it('reconciles a paid quest when persisting its claimed status failed', () => {
    let writes = 0
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === FARM_QUEST_KEY && ++writes === 2) throw new Error('quota')
        data.set(key, value)
      },
    })
    const finished = round({ bosses: 6 })
    expect(applyFarmQuests(day, finished, 'run-1').error).toBeTruthy()
    expect(loadFarmProfile().coins).toBe(400)
    const retry = applyFarmQuests(day, finished, 'run-1')
    expect(retry.log.total.hunt).toBe(6)
    expect(retry.log.claimed).toContain('hunt')
    expect(retry.completed).toEqual([])
    expect(loadFarmProfile().coins).toBe(400)
  })
  it('does not pay rewards if progress cannot be saved or the day mismatches', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(applyFarmQuests(day, round({ bosses: 6 }), 'run-1').error).toBeTruthy()
    expect(loadFarmProfile().coins).toBe(0)
    expect(applyFarmQuests('2026-10-05', round({ bosses: 6 }), 'run-1').completed).toEqual([])
  })
})
