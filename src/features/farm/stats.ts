import type { FarmRound } from './rules.mjs'

export type FarmCareer = { runs: number; bestScore: number; bestSeconds: number; harvested: number; bosses: number; coins: number }
export const FARM_CAREER_KEY = 'farm-career-v1'
export type FarmCareerRecord = { career: FarmCareer; records: { score: boolean; seconds: boolean }; error?: string }

const whole = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
const precise = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

// Career totals are local decoration around the leaderboard: a corrupt save
// restarts the counters instead of breaking the next run.
export function loadFarmCareer(): FarmCareer {
  let stored: unknown = null
  try { stored = JSON.parse(localStorage.getItem(FARM_CAREER_KEY) ?? 'null') } catch { stored = null }
  const source = (stored ?? {}) as Partial<Record<keyof FarmCareer, unknown>>
  return {
    runs: whole(source.runs), bestScore: whole(source.bestScore), bestSeconds: precise(source.bestSeconds),
    harvested: whole(source.harvested), bosses: whole(source.bosses), coins: whole(source.coins),
  }
}

export function recordFarmCareer(round: FarmRound): FarmCareerRecord {
  const previous = loadFarmCareer()
  const career: FarmCareer = {
    runs: previous.runs + 1,
    bestScore: Math.max(previous.bestScore, whole(round.score)),
    bestSeconds: Math.max(previous.bestSeconds, precise(round.seconds)),
    harvested: previous.harvested + whole(round.harvested),
    bosses: previous.bosses + whole(round.bosses),
    coins: previous.coins + whole(round.coins),
  }
  const records = { score: career.bestScore > previous.bestScore, seconds: career.bestSeconds > previous.bestSeconds }
  try {
    localStorage.setItem(FARM_CAREER_KEY, JSON.stringify(career))
    return { career, records }
  } catch { return { career: previous, records: { score: false, seconds: false }, error: '战绩暂时无法保存，浏览器存储可能已满。' } }
}
