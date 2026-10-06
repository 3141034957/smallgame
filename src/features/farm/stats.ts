import { accountStorage } from '@/utils/accountStorage'
import { TALENTS, type FarmRound, type Gear } from './rules.mjs'

export type FarmCareer = {
  runs: number
  bestScore: number
  bestSeconds: number
  bestCombo: number
  totalSeconds: number
  harvested: number
  bosses: number
  coins: number
  gear: Record<string, number>
}
export const FARM_CAREER_KEY = 'farm-career-v1'
export type FarmCareerRecord = {
  career: FarmCareer
  records: { score: boolean; seconds: boolean; combo: boolean }
  error?: string
}

const whole = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
const precise = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const levels = (value: unknown) => {
  const source = (value ?? {}) as Record<string, unknown>
  const gear: Record<string, number> = {}
  for (const [id, level] of Object.entries(source))
    if (typeof id === 'string' && id.length < 24) gear[id] = whole(level)
  return gear
}

// Career totals are local decoration around the leaderboard: a corrupt save
// restarts the counters instead of breaking the next run.
export function loadFarmCareer(): FarmCareer {
  let stored: unknown = null
  try {
    stored = JSON.parse(accountStorage.getItem(FARM_CAREER_KEY) ?? 'null')
  } catch {
    stored = null
  }
  const source = (stored ?? {}) as Partial<Record<keyof FarmCareer, unknown>>
  return {
    runs: whole(source.runs),
    bestScore: whole(source.bestScore),
    bestSeconds: precise(source.bestSeconds),
    bestCombo: whole(source.bestCombo),
    totalSeconds: precise(source.totalSeconds),
    harvested: whole(source.harvested),
    bosses: whole(source.bosses),
    coins: whole(source.coins),
    gear: levels(source.gear),
  }
}

export function farmCareerFavourite(career: FarmCareer): string {
  return (
    TALENTS.filter((talent) => talent.kind === 'weapon' && (career.gear[talent.id] ?? 0) > 0).sort(
      (a, b) => career.gear[b.id] - career.gear[a.id] || a.id.localeCompare(b.id),
    )[0]?.id ?? ''
  )
}

export function recordFarmCareer(round: FarmRound): FarmCareerRecord {
  const previous = loadFarmCareer()
  const gear = { ...previous.gear }
  for (const [id, level] of Object.entries((round.gear ?? {}) as Gear))
    gear[id] = (gear[id] ?? 0) + whole(level)
  const career: FarmCareer = {
    runs: previous.runs + 1,
    bestScore: Math.max(previous.bestScore, whole(round.score)),
    bestSeconds: Math.max(previous.bestSeconds, precise(round.seconds)),
    bestCombo: Math.max(previous.bestCombo, whole(round.maxCombo)),
    totalSeconds: previous.totalSeconds + precise(round.seconds),
    harvested: previous.harvested + whole(round.harvested),
    bosses: previous.bosses + whole(round.bosses),
    coins: previous.coins + whole(round.coins),
    gear,
  }
  const records = {
    score: career.bestScore > previous.bestScore,
    seconds: career.bestSeconds > previous.bestSeconds,
    combo: career.bestCombo > previous.bestCombo,
  }
  try {
    accountStorage.setItem(FARM_CAREER_KEY, JSON.stringify(career))
    return { career, records }
  } catch {
    return {
      career: previous,
      records: { score: false, seconds: false, combo: false },
      error: '战绩暂时无法保存，浏览器存储可能已满。',
    }
  }
}
