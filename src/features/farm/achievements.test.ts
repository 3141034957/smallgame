import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimFarmAchievements, FARM_ACHIEVEMENTS, FARM_ACHIEVEMENT_KEY, formatFarmAchievement, loadFarmAchievements } from './achievements'
import { MAX_GEAR_LEVEL, TALENTS } from './rules.mjs'
import type { FarmRound } from './rules.mjs'

const round = (patch: Partial<FarmRound> = {}): FarmRound => ({
  day: '2026-10-04', frames: [[50, 76]], choices: [], surges: [], outcome: 'defeated', hp: 0, seconds: 30, score: 100,
  maxCombo: 5, harvested: 10, bosses: 0, elites: 0, blocks: 0, maxShields: 0, coins: 20, xp: 30, stars: 1,
  gear: { drum: 0, orbit: 0, magnet: 0, range: 0, tempo: 0, power: 0, echo: 0, lucky: 0, bell: 0, sustain: 0, whistle: 0, delay: 0 }, ...patch,
})

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } })
})
afterEach(() => vi.unstubAllGlobals())

describe('survivor achievements', () => {
  it('starts empty and unlocks the milestones a finished run reached', () => {
    expect(loadFarmAchievements()).toEqual({ unlocked: {}, best: {} })
    expect(claimFarmAchievements(null)).toEqual({ log: { unlocked: {}, best: {} }, fresh: [] })
    const first = claimFarmAchievements(round())
    expect(first.fresh).toEqual(['encore'])
    expect(Object.keys(first.log.unlocked)).toEqual(['encore'])
    const big = claimFarmAchievements(round({ seconds: 620, harvested: 1200, bosses: 12, elites: 6, blocks: 5, maxShields: 3, maxCombo: 140, score: 120000, coins: 6000, gear: { ...round().gear, drum: MAX_GEAR_LEVEL, range: MAX_GEAR_LEVEL } }))
    expect(big.fresh).toEqual(['survivor-3', 'survivor-10', 'harvest-1000', 'boss-10', 'combo-100', 'final-form', 'score-100k', 'rich-5000', 'elite-5', 'guard', 'stack'])
    expect(big.log.unlocked['all-forms']).toBeUndefined()
    const full = claimFarmAchievements(round({ gear: Object.fromEntries(TALENTS.map((talent) => [talent.id, MAX_GEAR_LEVEL])) as FarmRound['gear'] }))
    expect(full.fresh).toEqual(['all-forms'])
    expect(Object.keys(full.log.unlocked)).toHaveLength(FARM_ACHIEVEMENTS.length)
  })

  it('never re-announces unlocked badges and keeps the best value seen', () => {
    claimFarmAchievements(round({ harvested: 500 }))
    const again = claimFarmAchievements(round({ harvested: 40 }))
    expect(again.fresh).toEqual([])
    expect(again.log.best['harvest-1000']).toBe(500)
    expect(Object.keys(again.log.unlocked)).toEqual(['encore'])
  })

  it('ignores corrupt or forged saves and reports storage failures without losing progress', () => {
    data.set(FARM_ACHIEVEMENT_KEY, '{broken')
    expect(loadFarmAchievements()).toEqual({ unlocked: {}, best: {} })
    data.set(FARM_ACHIEVEMENT_KEY, JSON.stringify({ unlocked: { encore: 'later', ghost: 1 }, best: { 'harvest-1000': -5, ghost: 9 } }))
    expect(loadFarmAchievements()).toEqual({ unlocked: {}, best: { 'harvest-1000': 0 } })
    const saved = claimFarmAchievements(round({ seconds: 200 }))
    expect(saved.log.unlocked['survivor-3']).toBeGreaterThan(0)
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: () => { throw new Error('quota') } })
    const failed = claimFarmAchievements(round({ harvested: 2000 }))
    expect(failed.error).toContain('无法保存')
    expect(failed.fresh).toEqual([])
    expect(Object.keys(failed.log.unlocked)).toEqual(['encore', 'survivor-3'])
  })

  it('formats progress in the unit of each badge', () => {
    const time = FARM_ACHIEVEMENTS.find((item) => item.id === 'survivor-10')!
    expect(formatFarmAchievement(time, 600)).toBe('10 分 00 秒')
    expect(formatFarmAchievement(time, 65)).toBe('1 分 05 秒')
    expect(formatFarmAchievement(FARM_ACHIEVEMENTS.find((item) => item.id === 'score-100k')!, 1200)).toBe('1,200')
    for (const achievement of FARM_ACHIEVEMENTS) expect(achievement.metric(round())).toBeGreaterThanOrEqual(0)
  })
})
