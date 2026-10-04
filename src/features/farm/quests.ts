import { routeSeed } from '../island/rules.mjs'
import { awardFarmCoins } from './characters'
import { evolved, type FarmRound } from './rules.mjs'

export type FarmQuest = {
  id: string
  name: string
  icon: string
  desc: string
  kind: 'best' | 'total'
  target: number
  reward: number
  metric: (round: FarmRound) => number
}

const TEMPLATES: FarmQuest[] = [
  { id: 'harvest', name: '今日热身', icon: '🎯', desc: '单局击败 400 只怪物', kind: 'best', target: 400, reward: 200, metric: (round) => round.harvested },
  { id: 'hunt', name: '巨兽讨伐', icon: '👑', desc: '今日累计击破 6 只巨兽', kind: 'total', target: 6, reward: 400, metric: (round) => round.bosses },
  { id: 'long', name: '长跑演出', icon: '⏱', desc: '单局生存 3 分钟', kind: 'best', target: 180, reward: 300, metric: (round) => round.seconds },
  { id: 'band', name: '乐队编制', icon: '✦', desc: '单局凑齐 2 组终极形态', kind: 'best', target: 2, reward: 500, metric: (round) => evolved(round.gear).length },
  { id: 'combo', name: '连打不停', icon: '🔥', desc: '单局最高连击 80', kind: 'best', target: 80, reward: 250, metric: (round) => round.maxCombo },
  { id: 'score', name: '高分贝', icon: '⭐', desc: '单局 80,000 分', kind: 'best', target: 80000, reward: 350, metric: (round) => round.score },
]

export const FARM_QUEST_KEY = 'farm-quests-v1'
export type FarmQuestLog = { day: string; best: Record<string, number>; total: Record<string, number>; claimed: string[] }
export type FarmQuestResult = { log: FarmQuestLog; completed: string[]; error?: string }

// Three goals per day, drawn from the day seed so everyone chases the same list.
export function farmQuests(day: string): FarmQuest[] {
  let seed = routeSeed(day, 'farm-quest') >>> 0
  const pool = [...TEMPLATES], picked: FarmQuest[] = []
  while (picked.length < 3 && pool.length) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    picked.push(pool.splice(seed % pool.length, 1)[0])
  }
  return picked
}

const empty = (day: string): FarmQuestLog => ({ day, best: {}, total: {}, claimed: [] })
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

export function loadFarmQuests(day: string): FarmQuestLog {
  let stored: unknown = null
  try { stored = JSON.parse(localStorage.getItem(FARM_QUEST_KEY) ?? 'null') } catch { stored = null }
  const source = (stored ?? {}) as Partial<FarmQuestLog>
  // A new day starts a fresh board; stale goals are never shown.
  if (source?.day !== day) return empty(day)
  const best: Record<string, number> = {}, total: Record<string, number> = {}
  for (const quest of farmQuests(day)) { best[quest.id] = number((source.best ?? {})[quest.id]); total[quest.id] = number((source.total ?? {})[quest.id]) }
  return { day, best, total, claimed: Array.isArray(source.claimed) ? source.claimed.filter((id) => typeof id === 'string') : [] }
}

export function farmQuestProgress(quest: FarmQuest, log: FarmQuestLog) {
  return quest.kind === 'best' ? log.best[quest.id] ?? 0 : log.total[quest.id] ?? 0
}
export const farmQuestDone = (quest: FarmQuest, log: FarmQuestLog) => farmQuestProgress(quest, log) >= quest.target

// Goals pay out once each, straight into the character shop wallet.
export function applyFarmQuests(day: string, round: FarmRound | null): FarmQuestResult {
  const previous = loadFarmQuests(day)
  if (!round) return { log: previous, completed: [] }
  const best = { ...previous.best }, total = { ...previous.total }, claimed = [...previous.claimed]
  for (const quest of farmQuests(day)) {
    const value = quest.metric(round)
    if (!Number.isFinite(value) || value < 0) continue
    best[quest.id] = Math.max(best[quest.id] ?? 0, value)
    total[quest.id] = (total[quest.id] ?? 0) + value
  }
  const completed: string[] = []
  let error: string | undefined
  for (const quest of farmQuests(day)) {
    if (claimed.includes(quest.id) || !farmQuestDone(quest, { day, best, total, claimed })) continue
    const paid = awardFarmCoins(`quest:${day}:${quest.id}`, quest.reward)
    if (paid.error) { error = paid.error; continue }
    claimed.push(quest.id); completed.push(quest.id)
  }
  const log = { day, best, total, claimed }
  try { localStorage.setItem(FARM_QUEST_KEY, JSON.stringify(log)) } catch { /* Goals stay claimable next run. */ }
  return { log, completed, error }
}
