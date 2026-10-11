import { accountStorage } from '@/utils/accountStorage'
import { routeSeed } from './calendar.mjs'
import { awardFarmCoins, loadFarmProfile } from './characters'
import { PERMANENT_CHAIN, permanentNextStep, permanentPrice } from './permanent.mjs'
import { evolved, type FarmRound } from './rules.mjs'

export type FarmQuest = {
  id: string
  name: string
  icon: string
  desc: string
  kind: 'best' | 'total'
  target: number
  // Share of the next chain step's price this goal pays out; harder goals
  // take a bigger slice, so a day of goals stays worth chasing deep into the
  // 40,200,000-coin chain instead of turning into pocket change.
  share: number
  reward: number
  metric: (round: FarmRound) => number
}
type FarmQuestTemplate = Omit<FarmQuest, 'reward'>

const TEMPLATES: FarmQuestTemplate[] = [
  {
    id: 'harvest',
    name: '今日热身',
    icon: '🎯',
    desc: '单局击败 400 只怪物',
    kind: 'best',
    target: 400,
    share: 0.09,
    metric: (round) => round.harvested,
  },
  {
    id: 'hunt',
    name: '巨兽讨伐',
    icon: '👑',
    desc: '今日累计击破 6 只巨兽',
    kind: 'total',
    target: 6,
    share: 0.16,
    metric: (round) => round.bosses,
  },
  {
    id: 'long',
    name: '长跑演出',
    icon: '⏱',
    desc: '单局生存 3 分钟',
    kind: 'best',
    target: 180,
    share: 0.12,
    metric: (round) => round.seconds,
  },
  {
    id: 'band',
    name: '乐队编制',
    icon: '✦',
    desc: '单局凑齐 2 组终极形态',
    kind: 'best',
    target: 2,
    share: 0.2,
    metric: (round) => evolved(round.gear).length,
  },
  {
    id: 'combo',
    name: '连打不停',
    icon: '🔥',
    desc: '单局最高连击 80',
    kind: 'best',
    target: 80,
    share: 0.1,
    metric: (round) => round.maxCombo,
  },
  {
    id: 'score',
    name: '高分贝',
    icon: '⭐',
    desc: '单局 80,000 分',
    kind: 'best',
    target: 80000,
    share: 0.14,
    metric: (round) => round.score,
  },
]

export const FARM_QUEST_KEY = 'farm-quests-v1'
export type FarmQuestLog = {
  day: string
  best: Record<string, number>
  total: Record<string, number>
  claimed: string[]
  appliedRuns?: string[]
}
export type FarmQuestResult = { log: FarmQuestLog; completed: string[]; error?: string }

// A finished chain has no next step to quote, so payouts track the priciest one.
const TOP_STEP_PRICE = PERMANENT_CHAIN[PERMANENT_CHAIN.length - 1]?.price ?? 2000

// What the player's next chain step costs: step N is 2,000 × N. Unreadable
// progress reads as an empty chain and quotes the first step.
export function farmQuestStepPrice(levels?: unknown): number {
  const id = permanentNextStep(levels)
  const price = id ? permanentPrice(id, 0) : null
  return price && price > 0 ? price : TOP_STEP_PRICE
}

// Whole coins, never zero: a damaged read must not swallow the payout.
export function farmQuestReward(share: number, stepPrice: number): number {
  const coins = Math.round(stepPrice * share)
  return Number.isFinite(coins) && coins > 0 ? coins : 1
}

// Without an explicit chain the day prices itself off the wallet the player
// actually has, so the reward shown matches the one that gets paid.
function storedLevels(): unknown {
  try {
    return loadFarmProfile().growth?.levels
  } catch {
    return undefined
  }
}

// Three goals per day, drawn from the day seed so everyone chases the same list.
export function farmQuests(day: string, levels?: unknown): FarmQuest[] {
  let seed = routeSeed(day, 'farm-quest') >>> 0
  const pool = [...TEMPLATES],
    picked: FarmQuestTemplate[] = []
  while (picked.length < 3 && pool.length) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    picked.push(pool.splice(seed % pool.length, 1)[0])
  }
  const stepPrice = farmQuestStepPrice(levels ?? storedLevels())
  return picked.map((quest) => ({ ...quest, reward: farmQuestReward(quest.share, stepPrice) }))
}

const empty = (day: string): FarmQuestLog => ({ day, best: {}, total: {}, claimed: [] })
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

export function loadFarmQuests(day: string): FarmQuestLog {
  let stored: unknown = null
  try {
    stored = JSON.parse(accountStorage.getItem(FARM_QUEST_KEY) ?? 'null')
  } catch {
    stored = null
  }
  const source = (stored ?? {}) as Partial<FarmQuestLog>
  // A new day starts a fresh board; stale goals are never shown.
  if (source?.day !== day) return empty(day)
  const best: Record<string, number> = {},
    total: Record<string, number> = {}
  for (const quest of farmQuests(day)) {
    best[quest.id] = number((source.best ?? {})[quest.id])
    total[quest.id] = number((source.total ?? {})[quest.id])
  }
  return {
    day,
    best,
    total,
    claimed: Array.isArray(source.claimed)
      ? source.claimed.filter((id) => typeof id === 'string')
      : [],
    appliedRuns: Array.isArray(source.appliedRuns)
      ? source.appliedRuns.filter((id) => typeof id === 'string').slice(-64)
      : [],
  }
}

export function farmQuestProgress(quest: FarmQuest, log: FarmQuestLog) {
  return quest.kind === 'best' ? (log.best[quest.id] ?? 0) : (log.total[quest.id] ?? 0)
}
export const farmQuestDone = (quest: FarmQuest, log: FarmQuestLog) =>
  farmQuestProgress(quest, log) >= quest.target

// Goals pay out once each, straight into the character shop wallet.
export function applyFarmQuests(
  day: string,
  round: FarmRound | null,
  runId?: string,
): FarmQuestResult {
  const previous = loadFarmQuests(day)
  if (!round || round.day !== day) return { log: previous, completed: [] }
  const best = { ...previous.best },
    total = { ...previous.total },
    claimed = [...previous.claimed]
  const appliedRuns = [...(previous.appliedRuns ?? [])]
  // Runs without an id cannot be told apart, so they share one dedupe key: a
  // retry must never count the same round twice, and the log stays string-only.
  const key = typeof runId === 'string' ? runId : ''
  if (!appliedRuns.includes(key)) {
    for (const quest of farmQuests(day)) {
      const value = quest.metric(round)
      if (!Number.isFinite(value) || value < 0) continue
      best[quest.id] = Math.max(best[quest.id] ?? 0, value)
      total[quest.id] = (total[quest.id] ?? 0) + value
    }
    appliedRuns.push(key)
  }
  const log = { day, best, total, claimed, appliedRuns: appliedRuns.slice(-64) }
  // Save progress before paying: retries must not count this run twice, even
  // when the wallet or the final claim write fails independently.
  try {
    accountStorage.setItem(FARM_QUEST_KEY, JSON.stringify(log))
  } catch {
    return { log: previous, completed: [], error: '今日目标暂时无法保存，请允许浏览器存储后重试。' }
  }
  const completed: string[] = []
  let error: string | undefined
  for (const quest of farmQuests(day)) {
    if (claimed.includes(quest.id) || !farmQuestDone(quest, { day, best, total, claimed })) continue
    const paid = awardFarmCoins(`quest:${day}:${quest.id}`, quest.reward)
    if (paid.error) {
      error = paid.error
      continue
    }
    claimed.push(quest.id)
    // A previous payment can have succeeded while its claim write failed.
    if (paid.paid) completed.push(quest.id)
  }
  try {
    accountStorage.setItem(FARM_QUEST_KEY, JSON.stringify(log))
  } catch {
    error = '今日目标领取状态暂时无法保存，请重试；已到账金币不会重复发放。'
  }
  return { log, completed, error }
}
