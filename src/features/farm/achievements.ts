import { evolved, type FarmRound } from './rules.mjs'

export type FarmAchievement = {
  id: string
  name: string
  icon: string
  desc: string
  unit: 'time' | 'count' | 'score' | 'coins'
  target: number
  metric: (round: FarmRound) => number
}

const clock = (value: number) => {
  const seconds = Math.floor(value)
  return seconds >= 60
    ? `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`
    : `${seconds} 秒`
}
const digits = (value: number) => value.toLocaleString()

export const FARM_ACHIEVEMENTS: FarmAchievement[] = [
  {
    id: 'encore',
    name: '首次返场',
    icon: '🏅',
    desc: '完成一局无限演出',
    unit: 'count',
    target: 1,
    metric: () => 1,
  },
  {
    id: 'survivor-3',
    name: '三分钟热度',
    icon: '⏱',
    desc: '单局生存满 3 分钟',
    unit: 'time',
    target: 180,
    metric: (round) => round.seconds,
  },
  {
    id: 'survivor-10',
    name: '压轴演出',
    icon: '⏱',
    desc: '单局生存满 10 分钟',
    unit: 'time',
    target: 600,
    metric: (round) => round.seconds,
  },
  {
    id: 'harvest-1000',
    name: '千音收割',
    icon: '🎯',
    desc: '单局击败 1000 只怪物',
    unit: 'count',
    target: 1000,
    metric: (round) => round.harvested,
  },
  {
    id: 'boss-10',
    name: '巨兽猎人',
    icon: '👑',
    desc: '单局击破 10 只鼓噪巨兽',
    unit: 'count',
    target: 10,
    metric: (round) => round.bosses,
  },
  {
    id: 'combo-100',
    name: '连击狂潮',
    icon: '🔥',
    desc: '单局最高连击达到 100',
    unit: 'count',
    target: 100,
    metric: (round) => round.maxCombo,
  },
  {
    id: 'final-form',
    name: '初次进化',
    icon: '✦',
    desc: '单局奏出一组终极形态',
    unit: 'count',
    target: 1,
    metric: (round) => evolved(round.gear).length,
  },
  {
    id: 'all-forms',
    name: '全编制乐队',
    icon: '✧',
    desc: '单局凑齐四组终极形态',
    unit: 'count',
    target: 4,
    metric: (round) => evolved(round.gear).length,
  },
  {
    id: 'score-100k',
    name: '十万分贝',
    icon: '⭐',
    desc: '单局清怪分数达到 100,000',
    unit: 'score',
    target: 100000,
    metric: (round) => round.score,
  },
  {
    id: 'rich-5000',
    name: '满载而归',
    icon: '🪙',
    desc: '单局拾取 5,000 金币',
    unit: 'coins',
    target: 5000,
    metric: (round) => round.coins,
  },
  {
    id: 'elite-5',
    name: '金唱片猎人',
    icon: '♛',
    desc: '单局击破 5 只金唱片精英',
    unit: 'count',
    target: 5,
    metric: (round) => round.elites ?? 0,
  },
  {
    id: 'guard',
    name: '音盾护卫',
    icon: '🛡',
    desc: '单局用音盾或音刃挡下 5 次伤害',
    unit: 'count',
    target: 5,
    metric: (round) => round.blocks ?? 0,
  },
  {
    id: 'stack',
    name: '三重音盾',
    icon: '🛡',
    desc: '单局同时持有 3 层音盾',
    unit: 'count',
    target: 3,
    metric: (round) => round.maxShields ?? 0,
  },
]

export const FARM_ACHIEVEMENT_KEY = 'farm-achievements-v1'
export type FarmAchievementLog = { unlocked: Record<string, number>; best: Record<string, number> }
export type FarmAchievementClaim = { log: FarmAchievementLog; fresh: string[]; error?: string }

export const formatFarmAchievement = (achievement: FarmAchievement, value: number) =>
  achievement.unit === 'time' ? clock(value) : digits(Math.round(value))

function readJSON(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

// Badges are local progress only: a corrupt or foreign save falls back to an
// empty wall instead of blocking the next run.
export function loadFarmAchievements(): FarmAchievementLog {
  const stored = readJSON(FARM_ACHIEVEMENT_KEY) as Partial<FarmAchievementLog> | null
  const unlocked: Record<string, number> = {},
    best: Record<string, number> = {}
  for (const achievement of FARM_ACHIEVEMENTS) {
    const at = (stored?.unlocked ?? {})[achievement.id]
    // Inside Date's range, otherwise the wall would render "Invalid Date".
    if (typeof at === 'number' && Number.isFinite(at) && at >= 0 && at < 8.64e15)
      unlocked[achievement.id] = at
    const value = (stored?.best ?? {})[achievement.id]
    if (typeof value === 'number' && Number.isFinite(value))
      best[achievement.id] = Math.max(0, value)
  }
  return { unlocked, best }
}

export function claimFarmAchievements(round: FarmRound | null): FarmAchievementClaim {
  const previous = loadFarmAchievements()
  if (!round) return { log: previous, fresh: [] }
  const unlocked = { ...previous.unlocked },
    best = { ...previous.best }
  const fresh: string[] = []
  const now = Date.now()
  for (const achievement of FARM_ACHIEVEMENTS) {
    const value = achievement.metric(round)
    if (!(value >= 0) || !Number.isFinite(value)) continue
    best[achievement.id] = Math.max(best[achievement.id] ?? 0, value)
    if (value >= achievement.target && unlocked[achievement.id] === undefined) {
      unlocked[achievement.id] = now
      fresh.push(achievement.id)
    }
  }
  const log = { unlocked, best }
  try {
    localStorage.setItem(FARM_ACHIEVEMENT_KEY, JSON.stringify(log))
    return { log, fresh }
  } catch {
    return { log: previous, fresh: [], error: '成就暂时无法保存，浏览器存储可能已满。' }
  }
}
