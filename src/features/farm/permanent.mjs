// Shared by simulation, upgrade descriptions and the recovery countdown.
export const RECOVERY = {
  safeSeconds: 8,
  regenSeconds: 12,
  regenAmounts: [1, 1.5, 2, 2.5, 3],
  shieldSeconds: [180, 150, 120],
}

export const PERMANENT_BRANCHES = [
  { id: 'survival', name: '生存保障', icon: '♡' },
  { id: 'power', name: '攻击成长', icon: '♫' },
  { id: 'movement', name: '操作手感', icon: '✦' },
]

// Talent-book order inside a branch: tier 1 is the entry, tier 4 the deepest.
export const PERMANENT_UPGRADES = [
  {
    id: 'vitality',
    branch: 'survival',
    tier: 1,
    name: '舞台体魄',
    icon: '♡',
    max: 12,
    base: 1500,
    description: '每级增加 5 点初始生命与生命上限。',
  },
  {
    id: 'armor',
    branch: 'survival',
    tier: 2,
    name: '舞台护甲',
    icon: '◇',
    max: 6,
    base: 3500,
    description: '每级减少 2% 生命伤害，所有敌人攻击均生效。',
  },
  {
    id: 'regen',
    branch: 'survival',
    tier: 3,
    name: '生命回响',
    icon: '✚',
    max: 5,
    prices: [3500, 14000, 35000, 80000, 160000],
    description: `受击后安全等待 ${RECOVERY.safeSeconds} 秒，再每 ${RECOVERY.regenSeconds} 秒恢复少量生命；第一口在第 ${RECOVERY.safeSeconds + RECOVERY.regenSeconds} 秒。`,
  },
  {
    id: 'shield',
    branch: 'survival',
    tier: 4,
    name: '守护音盾',
    icon: '⬡',
    max: 3,
    prices: [18000, 70000, 200000],
    description: '空盾时计时；任何有效受击或拾取护盾都会从零重计，自动只补 1 层。',
  },
  {
    id: 'power',
    branch: 'power',
    tier: 1,
    name: '乐感力量',
    icon: '♫',
    max: 15,
    base: 2000,
    description: '每级增加 2% 所有乐器与音浪爆发的伤害。',
  },
  {
    id: 'wisdom',
    branch: 'power',
    tier: 2,
    name: '演奏领悟',
    icon: '♬',
    max: 10,
    base: 2500,
    description: '每级增加 2% 获得经验，不改变金币收益。',
  },
  {
    id: 'stride',
    branch: 'movement',
    tier: 1,
    name: '轻快步伐',
    icon: '➜',
    max: 10,
    base: 1800,
    description: '每级增加 1% 移动速度，适用于键盘、鼠标与触控。',
  },
  {
    id: 'magnet',
    branch: 'movement',
    tier: 2,
    name: '音符吸引',
    icon: '✦',
    max: 10,
    base: 1500,
    description: '每级增加 4% 掉落吸引半径，与拾音器共同生效。',
  },
]

export const PERMANENT_TIER_LABELS = ['I', 'II', 'III', 'IV']
export function permanentTierLabel(tier) {
  return PERMANENT_TIER_LABELS[tier - 1] ?? String(tier)
}
// One branch read top to bottom: its talents ordered by tier. Pure visual order, no gating.
export function permanentTiers(branch) {
  return PERMANENT_UPGRADES.filter((item) => item.branch === branch).sort((a, b) => a.tier - b.tier)
}

export const PERMANENT_TOTAL_LEVELS = PERMANENT_UPGRADES.reduce((sum, item) => sum + item.max, 0)
export function normalizePermanentLevels(value) {
  return Object.fromEntries(
    PERMANENT_UPGRADES.map(({ id, max }) => [
      id,
      Number.isInteger(value?.[id]) && value[id] >= 0 && value[id] <= max ? value[id] : 0,
    ]),
  )
}
export function validPermanentLevels(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(([id, level]) => {
      const item = PERMANENT_UPGRADES.find((item) => item.id === id)
      return item && Number.isInteger(level) && level >= 0 && level <= item.max
    })
  )
}
export function permanentLevelCount(value) {
  return Object.values(normalizePermanentLevels(value)).reduce((sum, level) => sum + level, 0)
}
export function permanentPrice(id, level) {
  const item = PERMANENT_UPGRADES.find((item) => item.id === id)
  if (!item || !Number.isInteger(level) || level < 0 || level >= item.max) return null
  return (
    item.prices?.[level] ??
    100 * Math.ceil((item.base * (1 + 0.45 * level + 0.18 * level * level)) / 100)
  )
}
export function permanentStats(value) {
  const levels = normalizePermanentLevels(value)
  return {
    maxHp: 100 + levels.vitality * 5,
    damage: 1 + levels.power * 0.02,
    speed: 1 + levels.stride * 0.01,
    attraction: 1 + levels.magnet * 0.04,
    xp: 1 + levels.wisdom * 0.02,
    damageTaken: 1 - levels.armor * 0.02,
    regen: RECOVERY.regenAmounts[levels.regen - 1] ?? 0,
    shieldSeconds: RECOVERY.shieldSeconds[levels.shield - 1] ?? 0,
  }
}
export function permanentEffect(id, level) {
  if (id === 'vitality') return `生命上限 ${100 + level * 5}`
  if (id === 'power') return `伤害 +${level * 2}%`
  if (id === 'stride') return `移速 +${level}%`
  if (id === 'magnet') return `拾取半径 +${level * 4}%`
  if (id === 'wisdom') return `经验 +${level * 2}%`
  if (id === 'armor') return `减伤 ${level * 2}%`
  if (id === 'regen')
    return level
      ? `每 ${RECOVERY.regenSeconds} 秒恢复 ${RECOVERY.regenAmounts[level - 1]} 生命`
      : '自动回血未启用'
  if (id === 'shield')
    return level ? `空盾 ${RECOVERY.shieldSeconds[level - 1]} 秒补 1 层` : '自动补盾未启用'
  return ''
}
