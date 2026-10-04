import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyFarmQuests, farmQuestDone, farmQuests, farmQuestProgress, loadFarmQuests, FARM_QUEST_KEY } from './quests'
import { loadFarmProfile } from './characters'
import type { FarmRound } from './rules.mjs'

const day = '2026-10-04'
const round = (patch: Partial<FarmRound> = {}): FarmRound => ({
  day, frames: [[50, 76]], choices: [], surges: [], outcome: 'defeated', hp: 0, seconds: 30, score: 100,
  maxCombo: 5, harvested: 10, bosses: 0, coins: 20, xp: 30, stars: 1,
  gear: { drum: 0, orbit: 0, magnet: 0, range: 0, tempo: 0, power: 0, echo: 0, lucky: 0, bell: 0, sustain: 0 }, ...patch,
})

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } })
})
afterEach(() => vi.unstubAllGlobals())

describe('daily survivor quests', () => {
  it('gives every day the same three goals and starts at zero', () => {
    expect(farmQuests(day)).toEqual(farmQuests(day))
    expect(farmQuests(day)).toHaveLength(3)
    expect(new Set(farmQuests(day).map((quest) => quest.id)).size).toBe(3)
    expect(farmQuests('2026-10-05').map((quest) => quest.id)).not.toEqual(farmQuests(day).map((quest) => quest.id))
    const log = loadFarmQuests(day)
    for (const quest of farmQuests(day)) { expect(farmQuestProgress(quest, log)).toBe(0); expect(farmQuestDone(quest, log)).toBe(false) }
  })
  it('tracks single-run bests and daily totals, and pays each goal once', () => {
    const quests = farmQuests(day)
    const totalQuest = quests.find((quest) => quest.kind === 'total')!
    const bestQuest = quests.find((quest) => quest.kind === 'best')!
    const patch = (value: number): Partial<FarmRound> => ({ harvested: value, bosses: value, seconds: value, score: value, maxCombo: value })
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
  it('starts over on a new day and survives corrupt saves', () => {
    applyFarmQuests(day, round({ harvested: 50 }))
    expect(loadFarmQuests('2026-10-05').total).toEqual({})
    data.set(FARM_QUEST_KEY, '{broken')
    expect(loadFarmQuests(day).claimed).toEqual([])
    data.set(FARM_QUEST_KEY, JSON.stringify({ day, best: { hunt: -4 }, total: { hunt: 'x' }, claimed: [1, 'hunt'] }))
    const log = loadFarmQuests(day)
    expect(log.best.hunt).toBe(0)
    expect(log.total.hunt).toBe(0)
    expect(log.claimed).toEqual(['hunt'])
  })
})
