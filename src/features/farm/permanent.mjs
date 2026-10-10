// Permanent growth is one long chain: every step is a single, flat bonus and
// buying it is what unlocks the next one. Shared by simulation, the upgrade
// screen and the recovery countdown — no percentages anywhere in the chain.
export const RECOVERY = {
  safeSeconds: 8,
  regenSeconds: 12,
}

export const PERMANENT_BRANCHES = [
  { id: 'survival', name: '生存保障', icon: '♡' },
  { id: 'power', name: '攻击成长', icon: '♫' },
  { id: 'movement', name: '操作手感', icon: '✦' },
]

// The shield every run starts with recharges on its own once the chain bought
// a shield step; each of those steps takes ten more seconds off the wait.
export const SHIELD_BASE_SECONDS = 180
const SHIELD_STEP_SECONDS = 10
// One gold price per step: step N costs N × 2,000, so a 400k-point run (≈40k
// coins) always covers another step, and the whole chain costs 40,200,000.
const STEP_PRICE = 2000

// Quotas per effect: every step adds one flat amount, `unit` is what the number
// means. The chain interleaves the quotas instead of stacking them in blocks.
export const PERMANENT_KINDS = [
  { kind: 'vitality', branch: 'survival', icon: '♡', quota: 55, amount: 1, label: '生命 +1' },
  { kind: 'damage', branch: 'power', icon: '♫', quota: 25, amount: 1, label: '伤害 +1' },
  { kind: 'attraction', branch: 'movement', icon: '✦', quota: 30, amount: 2, label: '拾取 +2' },
  { kind: 'speed', branch: 'movement', icon: '➜', quota: 27, amount: 1, label: '移速 +1' },
  { kind: 'xp', branch: 'power', icon: '♬', quota: 32, amount: 1, label: '经验 +1' },
  { kind: 'armor', branch: 'survival', icon: '◇', quota: 8, amount: 1, label: '减伤 1' },
  { kind: 'regen', branch: 'survival', icon: '✚', quota: 8, amount: 1, label: '回血 +1' },
  { kind: 'shield', branch: 'survival', icon: '⬡', quota: 15, amount: 0, label: '' },
]

// Smooth weighted round-robin: every round each effect banks its quota, the
// one with the biggest score goes next and then pays the whole pool back, so
// effects stay spread out and the chain is reproducible without randomness.
function interleave(kinds) {
  const total = kinds.reduce((sum, item) => sum + item.quota, 0)
  const pool = kinds.map((item) => ({ item, score: 0, left: item.quota }))
  const order = []
  while (order.length < total) {
    let weight = 0
    let best = null
    for (const entry of pool) {
      if (!entry.left) continue
      weight += entry.item.quota
      entry.score += entry.item.quota
      if (!best || entry.score > best.score) best = entry
    }
    best.score -= weight
    best.left -= 1
    order.push(best.item)
  }
  return order
}

// The chain itself: one flat bonus per step, shield steps quoting the wait they
// leave behind (170, 160 … 30 seconds).
export const PERMANENT_STEPS = (() => {
  let shields = 0
  return interleave(PERMANENT_KINDS).map(({ kind, branch, icon, amount, label }) => {
    if (kind !== 'shield') return { kind, branch, icon, amount, label }
    shields += 1
    const seconds = SHIELD_BASE_SECONDS - SHIELD_STEP_SECONDS * shields
    return { kind, branch, icon, amount: seconds, label: `补盾 ${seconds} 秒` }
  })
})()

export const PERMANENT_UPGRADES = PERMANENT_STEPS.map((step, index) => ({
  id: `step-${index + 1}`,
  name: step.label,
  icon: step.icon,
  branch: step.branch,
  kind: step.kind,
  amount: step.amount,
  order: index,
  max: 1,
  price: STEP_PRICE * (index + 1),
}))
export const PERMANENT_CHAIN = PERMANENT_UPGRADES
export const PERMANENT_TOTAL_LEVELS = PERMANENT_UPGRADES.length
const BY_ID = new Map(PERMANENT_UPGRADES.map((item) => [item.id, item]))

// Saves from the old multi-level tree carry ids this chain never had, so they
// read back as an empty chain: the growth is cleared, not converted.
export function normalizePermanentLevels(value) {
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
  const stats = {
    maxHp: 100,
    damage: 0,
    // Units per second added on top of the base walking speed.
    speed: 0,
    attraction: 0,
    xp: 0,
    // Life shaved off every hit, flat.
    armor: 0,
    regen: 0,
    shieldSeconds: 0,
  }
  // One pass over the chain: every owned step adds its flat amount.
  for (const item of PERMANENT_UPGRADES) {
    if (!value?.[item.id]) continue
    if (item.kind === 'shield') stats.shieldSeconds = item.amount
    else if (item.kind === 'vitality') stats.maxHp += item.amount
    else stats[item.kind] += item.amount
  }
  return stats
}

export function permanentEffect(id, level) {
  const item = BY_ID.get(id)
  if (!item) return ''
  if (level) return `已获得 · ${item.name}`
  return item.name
}
