// Permanent growth is one long chain: every step is a single, flat bonus and
// buying it is what unlocks the next one. Shared by simulation, the upgrade
// screen and the recovery countdown — no percentages anywhere in the chain.
export const RECOVERY = {
  safeSeconds: 8,
  regenSeconds: 12,
  shieldSeconds: [180, 150, 120],
}

export const PERMANENT_BRANCHES = [
  { id: 'survival', name: '生存保障', icon: '♡' },
  { id: 'power', name: '攻击成长', icon: '♫' },
  { id: 'movement', name: '操作手感', icon: '✦' },
]

// Every chain step adds one flat amount. `unit` is what the number means.
export const PERMANENT_STEPS = [
  { kind: 'vitality', branch: 'survival', icon: '♡', amount: 10, label: '生命 +10' },
  { kind: 'damage', branch: 'power', icon: '♫', amount: 1, label: '伤害 +1' },
  { kind: 'attraction', branch: 'movement', icon: '✦', amount: 8, label: '拾取 +8' },
  { kind: 'speed', branch: 'movement', icon: '➜', amount: 2, label: '移速 +2' },
  { kind: 'vitality', branch: 'survival', icon: '♡', amount: 10, label: '生命 +10' },
  { kind: 'xp', branch: 'power', icon: '♬', amount: 2, label: '经验 +2' },
  { kind: 'armor', branch: 'survival', icon: '◇', amount: 1, label: '减伤 1' },
  { kind: 'damage', branch: 'power', icon: '♫', amount: 1, label: '伤害 +1' },
  { kind: 'vitality', branch: 'survival', icon: '♡', amount: 10, label: '生命 +10' },
  { kind: 'regen', branch: 'survival', icon: '✚', amount: 1, label: '回血 +1' },
  { kind: 'attraction', branch: 'movement', icon: '✦', amount: 8, label: '拾取 +8' },
  { kind: 'damage', branch: 'power', icon: '♫', amount: 1, label: '伤害 +1' },
  { kind: 'vitality', branch: 'survival', icon: '♡', amount: 10, label: '生命 +10' },
  { kind: 'speed', branch: 'movement', icon: '➜', amount: 2, label: '移速 +2' },
  { kind: 'armor', branch: 'survival', icon: '◇', amount: 1, label: '减伤 1' },
  { kind: 'shield', branch: 'survival', icon: '⬡', amount: 180, label: '补盾 180 秒' },
  { kind: 'xp', branch: 'power', icon: '♬', amount: 2, label: '经验 +2' },
  { kind: 'vitality', branch: 'survival', icon: '♡', amount: 10, label: '生命 +10' },
  { kind: 'damage', branch: 'power', icon: '♫', amount: 1, label: '伤害 +1' },
  { kind: 'attraction', branch: 'movement', icon: '✦', amount: 8, label: '拾取 +8' },
  { kind: 'regen', branch: 'survival', icon: '✚', amount: 1, label: '回血 +1' },
  { kind: 'vitality', branch: 'survival', icon: '♡', amount: 10, label: '生命 +10' },
  { kind: 'armor', branch: 'survival', icon: '◇', amount: 1, label: '减伤 1' },
  { kind: 'shield', branch: 'survival', icon: '⬡', amount: 150, label: '补盾 150 秒' },
  { kind: 'xp', branch: 'power', icon: '♬', amount: 2, label: '经验 +2' },
  { kind: 'attraction', branch: 'movement', icon: '✦', amount: 8, label: '拾取 +8' },
  { kind: 'damage', branch: 'power', icon: '♫', amount: 1, label: '伤害 +1' },
  { kind: 'speed', branch: 'movement', icon: '➜', amount: 2, label: '移速 +2' },
  { kind: 'shield', branch: 'survival', icon: '⬡', amount: 120, label: '补盾 120 秒' },
]

// Prices climb along the chain, so the deep steps stay a real goal.
const stepPrice = (index) =>
  50 * Math.round((1200 * (1 + 0.25 * index + 0.06 * index * index)) / 50)

export const PERMANENT_UPGRADES = PERMANENT_STEPS.map((step, index) => ({
  id: `step-${index + 1}`,
  name: step.label,
  icon: step.icon,
  branch: step.branch,
  kind: step.kind,
  amount: step.amount,
  order: index,
  max: 1,
  price: stepPrice(index),
}))
export const PERMANENT_CHAIN = PERMANENT_UPGRADES
export const PERMANENT_TOTAL_LEVELS = PERMANENT_UPGRADES.length
const BY_ID = new Map(PERMANENT_UPGRADES.map((item) => [item.id, item]))

// Old saves stored up to 15 levels per upgrade. Read them as "how many chain
// steps this player earned" and grant that many steps from the head, so a
// migrated profile is always a valid, unbroken prefix of the chain.
const LEGACY_SCALE = {
  vitality: 1 / 2,
  power: 1 / 3,
  armor: 1 / 2,
  regen: 3 / 5,
  shield: 1,
  wisdom: 1 / 3,
  stride: 1 / 3,
  magnet: 1 / 2.5,
}
export function legacyStepCount(value) {
  const earned = Object.entries(LEGACY_SCALE).reduce(
    (sum, [id, scale]) => sum + Math.floor((Number(value?.[id]) || 0) * scale),
    0,
  )
  return Math.min(PERMANENT_TOTAL_LEVELS, Math.max(0, earned))
}
export function normalizePermanentLevels(value) {
  if (value && Object.values(value).some((level) => (Number(level) || 0) > 1))
    return Object.fromEntries(
      PERMANENT_UPGRADES.map((item, index) => [item.id, index < legacyStepCount(value) ? 1 : 0]),
    )
  return Object.fromEntries(PERMANENT_UPGRADES.map((item) => [item.id, value?.[item.id] ? 1 : 0]))
}
export function validPermanentLevels(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(([id, level]) => BY_ID.has(id) && (level === 0 || level === 1))
  )
}
export function permanentLevelCount(value) {
  return Object.values(normalizePermanentLevels(value)).reduce((sum, level) => sum + level, 0)
}
// The chain is unlocked strictly in order: a step opens once every earlier one
// is owned. Returns the id of the next buyable step, or null when finished.
export function permanentNextStep(value) {
  const levels = normalizePermanentLevels(value)
  return PERMANENT_UPGRADES.find((item) => !levels[item.id])?.id ?? null
}
export function permanentIsUnlocked(value, id) {
  const item = BY_ID.get(id)
  if (!item) return false
  const levels = normalizePermanentLevels(value)
  if (levels[id]) return true
  return permanentNextStep(levels) === id
}
export function permanentPrice(id, level) {
  const item = BY_ID.get(id)
  if (!item || level !== 0) return null
  return item.price
}

export function permanentStats(value) {
  const levels = normalizePermanentLevels(value)
  const bought = (kind) =>
    PERMANENT_UPGRADES.reduce(
      (sum, item) => (item.kind === kind && levels[item.id] ? sum + item.amount : sum),
      0,
    )
  const shields = PERMANENT_UPGRADES.reduce(
    (best, item) => (item.kind === 'shield' && levels[item.id] ? item.amount : best),
    0,
  )
  return {
    maxHp: 100 + bought('vitality'),
    damage: bought('damage'),
    // Units per second added on top of the base walking speed.
    speed: bought('speed'),
    attraction: bought('attraction'),
    xp: bought('xp'),
    // Life shaved off every hit, flat.
    armor: bought('armor'),
    regen: bought('regen'),
    shieldSeconds: shields,
  }
}

export function permanentEffect(id, level) {
  const item = BY_ID.get(id)
  if (!item) return ''
  if (level) return `已获得 · ${item.name}`
  return item.name
}
