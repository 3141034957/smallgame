import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFarmCareer, recordFarmCareer, FARM_CAREER_KEY } from './stats'
import type { FarmRound } from './rules.mjs'

const round = (patch: Partial<FarmRound> = {}): FarmRound => ({
  day: '2026-10-04', frames: [[50, 76]], choices: [], surges: [], outcome: 'defeated', hp: 0, seconds: 40, score: 500,
  maxCombo: 8, harvested: 30, bosses: 2, elites: 0, blocks: 0, maxShields: 0, coins: 100, xp: 40, stars: 1,
  gear: { drum: 0, orbit: 0, magnet: 0, range: 0, tempo: 0, power: 0, echo: 0, lucky: 0, bell: 0, sustain: 0 }, ...patch,
})

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } })
})
afterEach(() => vi.unstubAllGlobals())

describe('survivor career totals', () => {
  it('starts empty and accumulates runs, harvests and bosses', () => {
    expect(loadFarmCareer()).toEqual({ runs: 0, bestScore: 0, bestSeconds: 0, harvested: 0, bosses: 0, coins: 0 })
    const first = recordFarmCareer(round())
    expect(first.career).toEqual({ runs: 1, bestScore: 500, bestSeconds: 40, harvested: 30, bosses: 2, coins: 100 })
    expect(first.records).toEqual({ score: true, seconds: true })
    const second = recordFarmCareer(round({ score: 200, seconds: 20, harvested: 10, bosses: 1, coins: 50 }))
    expect(second.career).toMatchObject({ runs: 2, bestScore: 500, bestSeconds: 40, harvested: 40, bosses: 3, coins: 150 })
    expect(second.records).toEqual({ score: false, seconds: false })
  })

  it('ignores corrupt or negative saves', () => {
    data.set(FARM_CAREER_KEY, '{broken')
    expect(loadFarmCareer().runs).toBe(0)
    data.set(FARM_CAREER_KEY, JSON.stringify({ runs: -3, bestScore: 'x', bestSeconds: NaN, harvested: 4.9, bosses: 2, coins: 1 }))
    expect(loadFarmCareer()).toEqual({ runs: 0, bestScore: 0, bestSeconds: 0, harvested: 4, bosses: 2, coins: 1 })
  })

  it('keeps the previous totals when the browser refuses to store them', () => {
    const saved = recordFarmCareer(round())
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: () => { throw new Error('quota') } })
    const failed = recordFarmCareer(round({ score: 9000 }))
    expect(failed.error).toContain('无法保存')
    expect(failed.career).toEqual(saved.career)
    expect(failed.records).toEqual({ score: false, seconds: false })
  })
})
