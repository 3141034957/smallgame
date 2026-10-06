import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { farmCareerFavourite, loadFarmCareer, recordFarmCareer, FARM_CAREER_KEY } from './stats'
import { TALENTS } from './rules.mjs'
import type { FarmRound } from './rules.mjs'

const emptyGear = () =>
  Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])) as FarmRound['gear']
const round = (patch: Partial<FarmRound> = {}): FarmRound => ({
  day: '2026-10-04',
  frames: [[50, 76]],
  choices: [],
  surges: [],
  outcome: 'defeated',
  hp: 0,
  seconds: 40,
  score: 500,
  maxCombo: 8,
  harvested: 30,
  bosses: 2,
  elites: 0,
  blocks: 0,
  maxShields: 0,
  coins: 100,
  xp: 40,
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

describe('survivor career totals', () => {
  it('starts empty and accumulates runs, harvests and bosses', () => {
    expect(loadFarmCareer()).toEqual({
      runs: 0,
      bestScore: 0,
      bestSeconds: 0,
      bestCombo: 0,
      totalSeconds: 0,
      harvested: 0,
      bosses: 0,
      coins: 0,
      gear: {},
    })
    const first = recordFarmCareer(round({ gear: { ...round().gear, drum: 3, echo: 1 } }))
    expect(first.career).toMatchObject({
      runs: 1,
      bestScore: 500,
      bestSeconds: 40,
      bestCombo: 8,
      totalSeconds: 40,
      harvested: 30,
      bosses: 2,
      coins: 100,
      gear: { drum: 3, echo: 1 },
    })
    expect(first.records).toEqual({ score: true, seconds: true, combo: true })
    expect(farmCareerFavourite(first.career)).toBe('drum')
    const second = recordFarmCareer(
      round({
        score: 200,
        seconds: 20,
        maxCombo: 30,
        harvested: 10,
        bosses: 1,
        coins: 50,
        gear: { ...round().gear, echo: 4 },
      }),
    )
    expect(second.career).toMatchObject({
      runs: 2,
      bestScore: 500,
      bestSeconds: 40,
      bestCombo: 30,
      totalSeconds: 60,
      harvested: 40,
      bosses: 3,
      coins: 150,
      gear: { drum: 3, echo: 5 },
    })
    expect(second.records).toEqual({ score: false, seconds: false, combo: true })
    expect(farmCareerFavourite(second.career)).toBe('echo')
  })

  it('ignores corrupt or negative saves', () => {
    data.set(FARM_CAREER_KEY, '{broken')
    expect(loadFarmCareer().runs).toBe(0)
    data.set(
      FARM_CAREER_KEY,
      JSON.stringify({
        runs: -3,
        bestScore: 'x',
        bestSeconds: NaN,
        harvested: 4.9,
        bosses: 2,
        coins: 1,
        gear: { drum: -2, echo: 'x' },
      }),
    )
    expect(loadFarmCareer()).toMatchObject({
      runs: 0,
      bestScore: 0,
      harvested: 4,
      bosses: 2,
      coins: 1,
      gear: {},
    })
  })

  it('keeps the previous totals when the browser refuses to store them', () => {
    const saved = recordFarmCareer(round())
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    const failed = recordFarmCareer(round({ score: 9000 }))
    expect(failed.error).toContain('无法保存')
    expect(failed.career).toEqual(saved.career)
    expect(failed.records).toEqual({ score: false, seconds: false, combo: false })
  })
})
