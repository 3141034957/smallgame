import { routeSeed, todayRoute, validDay } from '../island/rules.mjs'
export { todayRoute, validDay }
export const FPS = 16
export const MOVE_STEP = 3
export const START = [50, 76]
// Keep the first recipe attainable, then grow the cost of each additional
// upgrade. XP is cumulative; picking a talent never discards overflow.
export const UPGRADE_XP = [20, 45, 75, 110, 150, 200,
  ...Array.from({ length: 30 }, (_, index) => { const level = index + 1; return 200 + 50 * level + 2 * level ** 2 })]
export const THRESHOLDS = UPGRADE_XP.map((_, index) => UPGRADE_XP.slice(0, index + 1).reduce((sum, cost) => sum + cost, 0))
export const EXPERIENCE_STAGES = [
  { seconds: 0, multiplier: 1 },
  { seconds: 30, multiplier: 1.25 },
  { seconds: 60, multiplier: 1.6 },
  { seconds: 120, multiplier: 2 },
  { seconds: 180, multiplier: 2.5 },
  { seconds: 300, multiplier: 3 },
]
export const MAX_BOSSES = 4
// Healing drops are limited: at most one pack on the field, one every
// HEAL_COOLDOWN, and each pack vanishes after HEAL_TTL. Without this the
// endless mode never ends once the build harvests faster than enemies hurt.
export const HEAL_COOLDOWN = 15 * FPS
export const HEAL_TTL = 10 * FPS
export const HEAL_WOUNDED = 0.8
// Shield pickups are rarer than healing: they absorb one hit each.
export const SHIELD_EVERY = 40
export const SHIELD_COOLDOWN = 20 * FPS
export const SHIELD_LIMIT = 3
export const TALENTS = [
  { id: 'drum', kind: 'weapon', partner: 'range', name: '鼓手咚咚', icon: '🥁', color: '#edaa8e', description: '击败怪物，鼓点引爆周围怪群。', tag: '连锁爆破' },
  { id: 'orbit', kind: 'weapon', partner: 'tempo', name: '吉他手弦弦', icon: '🎸', color: '#b7a0dd', description: '旋转音符绕着你飞，碰到怪物就造成伤害。', tag: '旋转音刃' },
  { id: 'power', kind: 'weapon', partner: 'magnet', name: '贝斯手阿低', icon: '🎻', color: '#a5b7d1', description: '奏出低音光柱，击穿同列敌人。', tag: '贯穿攻击' },
  { id: 'echo', kind: 'weapon', partner: 'lucky', name: '主唱麦麦', icon: '🎤', color: '#df9bb1', description: '追着怪物唱出高音箭雨，自动命中。', tag: '自动追踪' },
  { id: 'range', kind: 'chip', partner: 'drum', name: '共鸣音箱', icon: '◉', color: '#9ebf86', description: '扩大收割音浪，让身边更多小怪一起爆开。', tag: '收割范围' },
  { id: 'tempo', kind: 'chip', partner: 'orbit', name: '节拍器', icon: '⚡', color: '#d9bb74', description: '音浪发射更快，配吉他手进化。', tag: '攻击速度' },
  { id: 'magnet', kind: 'chip', partner: 'power', name: '拾音器', icon: '🧲', color: '#91baac', description: '经验和金币从远处飞来，配贝斯手进化。', tag: '掉落磁吸' },
  { id: 'lucky', kind: 'chip', partner: 'echo', name: '安可徽章', icon: '★', color: '#dbbb6b', description: '增加暴击、金币和经验，配主唱进化。', tag: '暴击与收益' },
  { id: 'bell', kind: 'weapon', partner: 'sustain', name: '键盘手叮当', icon: '🎹', color: '#8fb7d9', description: '每隔几秒向外扩散一圈星浪，推开并伤害身边怪群。', tag: '环形冲击' },
  { id: 'sustain', kind: 'chip', partner: 'bell', name: '延音踏板', icon: '◐', color: '#7fa8c4', description: '星浪更快更广，配键盘手进化。', tag: '冲击强化' },
  { id: 'whistle', kind: 'weapon', partner: 'delay', name: '口琴手呼呼', icon: '🎷', color: '#9ac6b4', description: '走过的地方留下延迟音符，踩到的怪物持续受伤。', tag: '残留音阵' },
  { id: 'delay', kind: 'chip', partner: 'whistle', name: '延迟效果器', icon: '◑', color: '#84b3a2', description: '残留音符更久更密，配口琴手进化。', tag: '残留强化' },
]
export const RECIPES = [
  { weapon: 'drum', chip: 'range', name: '雷霆鼓组', icon: '🥁', description: '爆破范围大幅扩张，连锁伤害翻倍' },
  { weapon: 'orbit', chip: 'tempo', name: '星环电吉他', icon: '🎸', description: '六道音刃环绕，触碰伤害翻倍' },
  { weapon: 'power', chip: 'magnet', name: '黑洞贝斯', icon: '🎻', description: '黑洞大范围收割，全场经验涌向你' },
  { weapon: 'echo', chip: 'lucky', name: '星雨麦克风', icon: '🎤', description: '一次追击八只怪，全场降下暴击音雨' },
  { weapon: 'bell', chip: 'sustain', name: '银河键盘', icon: '🎹', description: '星浪连发三圈，范围与伤害大幅提升' },
  { weapon: 'whistle', chip: 'delay', name: '回音口琴阵', icon: '🎷', description: '残留音符更长更痛，整片舞台都是你的音阵' },
]
// Every calendar day plays under one modifier, drawn from the day seed so all
// players on that day share it and the leaderboard stays comparable.
export const FARM_MODIFIERS = [
  { id: 'calm', name: '慢板', icon: '☾', desc: '怪物少两成，但经验与金币多四成', wave: 0.8, reward: 1.4 },
  { id: 'swarm', name: '密潮', icon: '❋', desc: '每波怪物多五成，收割更爽', wave: 1.5 },
  { id: 'tough', name: '重甲', icon: '▣', desc: '怪物生命 +1，需要更硬的构筑', health: 1 },
  { id: 'swift', name: '急板', icon: '⚡', desc: '怪物移速快两成', speed: 1.2 },
  { id: 'golden', name: '丰收', icon: '🪙', desc: '金币与经验多五成', reward: 1.5 },
  { id: 'brisk', name: '短弓', icon: '♭', desc: '巨兽来得更早，奖励多两成', boss: 0.8, reward: 1.2 },
]
export const farmModifier = (day) => FARM_MODIFIERS[routeSeed(day, 'farm-mod') % FARM_MODIFIERS.length]
export const evolved = (gear) => RECIPES.filter((recipe) => gear[recipe.weapon] >= 3 && gear[recipe.chip] >= 3).map((recipe) => recipe.weapon)
const PITCHES = [60, 64, 67, 69, 72, 76]
export function clampPoint(previous, desired) {
  const dx = desired[0] - previous[0], dy = desired[1] - previous[1], length = Math.hypot(dx, dy), scale = length > MOVE_STEP ? MOVE_STEP / length : 1
  return [Math.round(previous[0] + dx * scale), Math.round(previous[1] + dy * scale)]
}
export function synergies(gear) {
  return RECIPES.filter((recipe) => gear[recipe.weapon] >= 3 && gear[recipe.chip] >= 3).map((recipe) => recipe.name)
}
const random = (state) => { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296 }
const distance = (a, b) => Math.hypot((a[0] - b[0]) * .84, a[1] - b[1])
// Keep the opening minute familiar, then increase pressure without spawning
// unbounded entities or letting movement speed grow past controllable levels.
const enemyHealth = (tick, kind) => 1 + Math.floor(tick / 240)
  + Math.floor(Math.max(0, tick - FPS * 60) / (FPS * 30)) ** 2 + (kind === 3 ? 2 : 0)
// World coordinates have no arena walls. A short portal warning makes arrivals
// fair even when a wide desktop camera can see the surrounding spawn ring.
function placeAtEdge(state, enemy, respawn = false) {
  // Rewards belong to the monster's birth stage. Kiting it across a stage
  // boundary (or relocating it back into view) must not inflate its drop.
  if (respawn || enemy.xpStage === undefined) enemy.xpStage = EXPERIENCE_STAGES.findLastIndex((stage) => state.tick >= stage.seconds * FPS)
  const angle = random(state) * Math.PI * 2, radius = 52 + random(state) * 16
  enemy.x = state.position[0] + Math.cos(angle) * radius / .84
  enemy.y = state.position[1] + Math.sin(angle) * radius
  enemy.spawnAt = state.tick + 12
}
export function createFarm(day) {
  if (!validDay(day)) throw new Error('Invalid farm date')
  const modifier = farmModifier(day)
  const state = { day, seed: routeSeed(day, 'farm-v3'), tick: 0, position: [...START], crops: [], loot: [], gear: Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])), xp: 0, level: 0, offered: [], score: 0, coins: 0, harvested: 0, bosses: 0, elites: 0, blocks: 0, maxShields: 0, combo: 0, maxCombo: 0, lastHarvest: -1000, charge: 0, nextId: 100, lastPulse: -8, echoDue: -1, bellRings: 0, modifier: modifier.id, nextBoss: Math.round(16 * FPS * (modifier.boss ?? 1)), nextBass: Math.round(90 * FPS * (modifier.boss ?? 1)), surgeUntil: -1, hp: 100, maxHp: 100, hurtUntil: 32, nextHeal: 0, nextShield: 0, shields: 0, shots: [], dangers: [], trails: [], nextWave: 32 }
  for (let id = 0; id < 24; id++) {
    const enemy = { id, x: 0, y: 0, kind: id % 4, hp: 1, maxHp: 1, regrow: -1, boss: false }
    placeAtEdge(state, enemy)
    state.crops.push(enemy)
  }
  // Keep a ready-to-harvest patch within the first sound wave.
  for (const [id, x, y] of [[64, 45, 72], [65, 55, 74], [66, 48, 83]]) state.crops.push({ id, x, y, kind: 0, hp: 1, maxHp: 1, regrow: -1, boss: false, xpStage: 0 })
  return state
}
export function orbitPositions(state) {
  const count = evolved(state.gear).includes('orbit') ? 6 : state.gear.orbit ? 1 + state.gear.orbit : 0
  return Array.from({ length: count }, (_, index) => {
    const angle = state.tick * .18 + index * Math.PI * 2 / count
    return [state.position[0] + Math.cos(angle) * (13 + state.gear.orbit * 2) / .84, state.position[1] + Math.sin(angle) * (13 + state.gear.orbit * 2)]
  })
}
function offer(state) {
  if (state.level >= THRESHOLDS.length || state.xp < THRESHOLDS[state.level] || state.hp <= 0) return
  if (!state.level) {
    const weapons = TALENTS.filter((talent) => talent.kind === 'weapon').map((talent) => talent.id)
    const omitted = Math.floor(random(state) * weapons.length)
    state.offered = weapons.filter((_, index) => index !== omitted)
    return
  }
  const available = TALENTS.filter((talent) => state.gear[talent.id] < 3).map((talent) => talent.id)
  const choices = []
  const focus = TALENTS.filter((talent) => talent.kind === 'weapon' && state.gear[talent.id] > 0 && !(state.gear[talent.id] >= 3 && state.gear[talent.partner] >= 3)).sort((a, b) => state.gear[b.id] - state.gear[a.id])[0]
  if (focus) { const needed = state.gear[focus.id] < 3 ? focus.id : focus.partner; choices.push(needed); available.splice(available.indexOf(needed), 1) }
  while (choices.length < 3 && available.length) choices.push(available.splice(Math.floor(random(state) * available.length), 1)[0])
  state.offered = choices
}
export function chooseTalent(previous, id) {
  if (!previous.offered.includes(id)) return null
  const state = { ...previous, gear: { ...previous.gear, [id]: previous.gear[id] + 1 }, level: previous.level + 1, offered: [] }
  offer(state)
  return state
}
export function stepFarm(previous, point, useSurge = false) {
  if (previous.offered.length || previous.hp <= 0 || !Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isSafeInteger(value)) || Math.hypot(point[0] - previous.position[0], point[1] - previous.position[1]) > MOVE_STEP + Math.SQRT1_2 || useSurge && previous.charge < 100) return null
  const state = { ...previous, position: [...point], crops: previous.crops.filter((crop) => !crop.boss || crop.hp > 0).map((crop) => ({ ...crop })), loot: previous.loot.map((drop) => ({ ...drop })), shots: previous.shots.map((shot) => ({ ...shot })), dangers: previous.dangers.map((danger) => ({ ...danger })), trails: previous.trails.map((trail) => ({ ...trail })), offered: [] }
  const events = []
  const gear = state.gear
  const modifier = FARM_MODIFIERS.find((item) => item.id === state.modifier)
  const forms = evolved(gear)
  const boomFlow = gear.orbit && gear.drum
  // A long combo pushes the whole band: louder waves, and a wider reach at
  // the top tier. It rewards staying inside the horde instead of kiting.
  const frenzy = state.combo >= 60 ? 2 : state.combo >= 30 ? 1 : 0
  const pulseDamage = 1 + Math.floor(gear.tempo / 3) + frenzy
  const harvest = (crop, chain = false) => {
    if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) return
    crop.hp = 0; crop.regrow = crop.boss ? Infinity : state.tick + Math.max(28, 60 - Math.floor(state.tick / 150))
    state.harvested++; state.bosses += crop.boss ? 1 : 0; state.elites += crop.elite ? 1 : 0
    state.combo = state.tick - state.lastHarvest <= FPS * 2 ? state.combo + 1 : 1
    state.maxCombo = Math.max(state.maxCombo, state.combo); state.lastHarvest = state.tick
    const multiplier = Math.min(5, 1 + Math.floor(state.combo / 10))
    const points = (crop.bass ? 2400 : crop.boss ? 1200 : crop.elite ? 320 : 40 + crop.kind * 10) * multiplier
    state.score += points; state.charge = Math.min(100, state.charge + (crop.bass ? 60 : crop.boss ? 40 : crop.elite ? 12 : 4))
    const reward = modifier?.reward ?? 1
    const xpMultiplier = EXPERIENCE_STAGES[crop.xpStage ?? 0].multiplier
    const dropXp = Math.round((crop.bass ? 110 : crop.boss ? 60 : crop.elite ? 30 : 5 + gear.lucky) * xpMultiplier * reward), dropCoins = Math.round((crop.bass ? 340 : crop.boss ? 200 : crop.elite ? 60 : 8 + crop.kind * 2 + gear.lucky * 5) * reward)
    const existingDrop = state.loot.find((drop) => !drop.heal && distance([drop.x, drop.y], [crop.x, crop.y]) < 3)
    if (existingDrop) { existingDrop.xp += dropXp; existingDrop.coins += dropCoins }
    else state.loot.push({ id: state.nextId++, x: crop.x, y: crop.y, xp: dropXp, coins: dropCoins })
    // One healing pack at a time, only while wounded, and on a long cooldown.
    const wounded = state.hp < state.maxHp * HEAL_WOUNDED
    if (state.tick >= state.nextHeal && !state.loot.some((drop) => drop.heal) && (crop.boss && state.hp < state.maxHp || state.harvested % 16 === 0 && wounded)) {
      state.loot.push({ id: state.nextId++, x: crop.x, y: crop.y, xp: 0, coins: 0, heal: crop.bass ? 35 : crop.boss ? 30 : 18, expires: state.tick + HEAL_TTL })
      state.nextHeal = state.tick + HEAL_COOLDOWN
    }
    if (state.tick >= state.nextShield && state.harvested % SHIELD_EVERY === 0 && !state.loot.some((drop) => drop.shield)) {
      state.loot.push({ id: state.nextId++, x: crop.x, y: crop.y, xp: 0, coins: 0, shield: 1 })
      state.nextShield = state.tick + SHIELD_COOLDOWN
    }
    events.push({ id: state.nextId++, kind: crop.boss ? 'boss' : 'harvest', x: crop.x, y: crop.y, points, lane: crop.kind, midi: PITCHES[crop.id % PITCHES.length], chain })
    if (gear.drum) {
      const radius = 7 + gear.drum * 2 + (boomFlow ? 3 : 0) + (forms.includes('drum') ? 12 : 0)
      events.push({ id: state.nextId++, kind: 'blast', x: crop.x, y: crop.y, radius, lane: 0 })
      for (const other of state.crops) if (other.hp > 0 && distance([other.x, other.y], [crop.x, crop.y]) <= radius) damage(other, (gear.drum + (boomFlow ? 1 : 0)) * (forms.includes('drum') ? 2 : 1), true)
    }
    if (crop.boss) for (const drop of state.loot) { drop.x = state.position[0]; drop.y = state.position[1] }
  }
  const damage = (crop, amount, chain = false) => {
    if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) return
    const critical = gear.lucky > 0 && (crop.id + state.tick) % Math.max(3, 8 - gear.lucky) === 0
    crop.hp -= amount * (critical ? 2 : 1)
    if (crop.hp <= 0) { crop.hp = .001; harvest(crop, chain) }
    else events.push({ id: state.nextId++, kind: 'hit', x: crop.x, y: crop.y, lane: crop.kind })
  }
  const pulse = (radius, amount, kind = 'pulse') => {
    events.push({ id: state.nextId++, kind, x: point[0], y: point[1], radius, lane: 1 })
    for (const crop of state.crops) if (crop.hp > 0 && distance([crop.x, crop.y], point) <= radius) damage(crop, amount)
  }
  for (const crop of state.crops) if (!crop.boss && crop.hp <= 0 && state.tick >= crop.regrow) {
    crop.kind = (crop.id + Math.floor(state.tick / 160)) % 4
    // A recycled slot always comes back as a regular monster, even if an elite
    // died in it — otherwise the crown and the elite rewards would stick.
    crop.elite = false; crop.dashUntil = -1
    crop.hp = enemyHealth(state.tick, crop.kind) + (modifier?.health ?? 0); crop.maxHp = crop.hp
    placeAtEdge(state, crop, true)
  }
  if (state.tick >= state.nextWave) {
    const count = Math.max(1, Math.round((3 + Math.floor(state.tick / 240)) * (modifier?.wave ?? 1)))
    const regularCount = state.crops.filter((crop) => !crop.boss).length
    for (let index = 0; index < count && regularCount + index < 100; index++) {
      const id = state.nextId++, kind = id % 4, hp = enemyHealth(state.tick, kind) + (modifier?.health ?? 0)
      const enemy = { id, x: 0, y: 0, kind, hp, maxHp: hp, regrow: -1, boss: false }
      placeAtEdge(state, enemy); state.crops.push(enemy)
    }
    state.nextWave += 12
  }
  // Gold-record elites join the horde after 45 seconds: beefier, they dash now
  // and then, and they pay far better than the monsters around them. The
  // monster pool caps at 100 and that cap also counts monsters waiting to
  // respawn, so a saturated arena would never see an elite. Elites therefore
  // take over a dead slot (or a free one) on their own timer.
  if (state.tick >= 45 * FPS && state.tick % 72 === 0 && state.crops.filter((crop) => crop.elite && crop.hp > 0).length < 5) {
    const hp = (enemyHealth(state.tick, 3) + (modifier?.health ?? 0)) * 6 + 8
    const slot = state.crops.find((crop) => !crop.boss && crop.hp <= 0)
    if (slot) { slot.kind = 3; slot.hp = hp; slot.maxHp = hp; slot.elite = true; slot.dashUntil = -1; placeAtEdge(state, slot, true) }
    else if (state.crops.filter((crop) => !crop.boss).length < 100) {
      const elite = { id: state.nextId++, x: 0, y: 0, kind: 3, hp, maxHp: hp, regrow: -1, boss: false, elite: true, dashUntil: -1 }
      placeAtEdge(state, elite); state.crops.push(elite)
    }
  }
  if (state.tick >= state.nextBoss) {
    state.nextBoss += 18 * FPS
    if (state.crops.filter((crop) => crop.boss).length < MAX_BOSSES) {
      const index = state.bosses + state.crops.filter((crop) => crop.boss).length
      const maxHp = 65 + index * 45
      const boss = { id: state.nextId++, x: 0, y: 0, kind: 3, hp: maxHp, maxHp, regrow: -1, boss: true }
      placeAtEdge(state, boss); state.crops.push(boss)
      events.push({ id: state.nextId++, kind: 'arrival', x: point[0], y: point[1], lane: 3 })
    }
  }
  // A slower, tankier boss joins later: it fires ring barrages and wide slams
  // instead of chasing, so late runs need movement instead of just damage.
  if (state.tick >= state.nextBass) {
    state.nextBass += 45 * FPS
    if (state.crops.filter((crop) => crop.boss).length < MAX_BOSSES) {
      const index = state.bosses + state.crops.filter((crop) => crop.boss).length
      const maxHp = 95 + index * 60
      const boss = { id: state.nextId++, x: 0, y: 0, kind: 3, hp: maxHp, maxHp, regrow: -1, boss: true, bass: true }
      placeAtEdge(state, boss); state.crops.push(boss)
      events.push({ id: state.nextId++, kind: 'arrival', x: point[0], y: point[1], lane: 3, bass: true })
    }
  }
  if (useSurge) { state.charge = 0; state.surgeUntil = state.tick + FPS * 3; state.hurtUntil = Math.max(state.hurtUntil, state.tick + FPS); state.shots = []; state.dangers = []; pulse(38 + gear.range * 2, 8 + gear.power, 'surge') }
  const rainDue = state.echoDue
  const interval = Math.max(3, 8 - gear.tempo - (state.tick < state.surgeUntil ? 2 : 0))
  if (state.tick - state.lastPulse >= interval) { pulse((15 + gear.range * 4) * (frenzy === 2 ? 1.3 : 1), pulseDamage); state.lastPulse = state.tick; if (gear.echo) state.echoDue = state.tick + Math.max(1, 4 - gear.echo) }
  if (state.tick === rainDue) {
    const targets = state.crops.filter((crop) => crop.hp > 0 && state.tick >= (crop.spawnAt ?? 0) && (forms.includes('echo') || distance([crop.x, crop.y], point) <= 38)).sort((a, b) => distance([a.x, a.y], point) - distance([b.x, b.y], point)).slice(0, forms.includes('echo') ? 8 : gear.echo + 1)
    for (const crop of targets) { events.push({ id: state.nextId++, kind: 'rain', x: crop.x, y: crop.y, fromX: point[0], fromY: point[1], lane: 3 }); damage(crop, gear.echo * (forms.includes('echo') ? 2 : 1)) }
    // A fast sound wave can schedule the next rain on the same tick. Keep it
    // without cancelling the rain that was already due.
    if (state.echoDue === rainDue) state.echoDue = -1
  }
  if (gear.power && state.tick % 12 === 0) {
    if (forms.includes('power')) {
      pulse(32, 4 + gear.power, 'blackhole')
      for (const drop of state.loot) { drop.x += (point[0] - drop.x) * .55; drop.y += (point[1] - drop.y) * .55 }
    } else {
      events.push({ id: state.nextId++, kind: 'beam', x: point[0], y: point[1], radius: 4 + gear.power * 2, lane: 2 })
      for (const crop of state.crops) if (crop.hp > 0 && Math.abs(crop.x - point[0]) <= 4 + gear.power * 2 && Math.abs(crop.y - point[1]) <= 120) damage(crop, gear.power + 1)
    }
  }
  // Echo whistle: leave delayed notes on the floor that keep hurting whatever
  // walks into them. Capped and expired so a long run cannot pile them up.
  if (gear.whistle) {
    const every = Math.max(10, 26 - gear.delay * 4)
    if (state.tick % every === 0) {
      state.trails.push({ id: state.nextId++, x: point[0], y: point[1], damage: gear.whistle + (forms.includes('whistle') ? 2 : 0), expires: state.tick + FPS * (3 + gear.delay) })
      if (state.trails.length > 30) state.trails.shift()
    }
  }
  state.trails = state.trails.filter((trail) => state.tick < trail.expires).slice(-30)
  for (const trail of state.trails) {
    if ((state.tick + trail.id) % 4) continue
    const radius = 10 + gear.delay * 2 + (forms.includes('whistle') ? 6 : 0)
    for (const crop of state.crops) {
      if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
      if (distance([crop.x, crop.y], [trail.x, trail.y]) <= radius) damage(crop, trail.damage)
    }
  }
  // Star tambourine: a slow, wide ring that also pushes monsters away, so it
  // covers the builds that keep getting cornered.
  if (gear.bell) {
    const interval = Math.max(12, 30 - gear.sustain * 4)
    if (state.tick % interval === 0) state.bellRings = forms.includes('bell') ? 3 : 1
    if (state.bellRings > 0 && state.tick % 4 === 0) {
      state.bellRings--
      const radius = 24 + gear.bell * 6 + gear.sustain * 4 + (forms.includes('bell') ? 18 : 0)
      events.push({ id: state.nextId++, kind: 'shock', x: point[0], y: point[1], radius, lane: 2 })
      for (const crop of state.crops) {
        if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
        const dist = distance([crop.x, crop.y], point)
        if (dist > radius) continue
        damage(crop, gear.bell + (forms.includes('bell') ? 2 : 0))
        const factor = 6 / Math.max(1, dist)
        crop.x += (crop.x - point[0] || 1) * factor; crop.y += (crop.y - point[1] || 1) * factor
      }
    }
  }
  if (state.tick % 2 === 0) for (const orb of orbitPositions(state)) for (const crop of state.crops) if (crop.hp > 0 && distance([crop.x, crop.y], orb) <= 6) damage(crop, (gear.orbit + (boomFlow ? 1 : 0)) * (forms.includes('orbit') ? 2 : 1))
  const attraction = 15 + gear.magnet * 15
  for (const drop of state.loot) {
    const dist = distance([drop.x, drop.y], point)
    if (dist <= attraction || state.tick < state.surgeUntil) {
      const amount = Math.min(1, (3 + gear.magnet * 1.5) / Math.max(.01, dist))
      drop.x += (point[0] - drop.x) * amount; drop.y += (point[1] - drop.y) * amount
    }
    if (distance([drop.x, drop.y], point) <= 4) { state.xp += drop.xp; state.coins += drop.coins; if (drop.shield) { state.shields = Math.min(SHIELD_LIMIT, state.shields + drop.shield); state.maxShields = Math.max(state.maxShields, state.shields) } if (drop.heal) { const healed = Math.min(drop.heal, state.maxHp - state.hp); state.hp += healed; if (healed) events.push({ id: state.nextId++, kind: 'heal', x: point[0], y: point[1], points: healed, lane: 1 }) } drop.collected = true; events.push({ id: state.nextId++, kind: 'collect', x: point[0], y: point[1], lane: 2 }) }
  }
  state.loot = state.loot.filter((drop) => !drop.collected && !(drop.expires && state.tick >= drop.expires) && distance([drop.x, drop.y], point) <= 240).slice(-600)
  const hurt = (amount) => {
    if (state.tick < state.hurtUntil || state.hp <= 0) return
    state.hurtUntil = state.tick + FPS
    // A held shield eats the whole hit instead of reducing it.
    if (state.shields > 0) {
      state.shields--; state.blocks++
      events.push({ id: state.nextId++, kind: 'shield', x: point[0], y: point[1], points: amount, lane: 1 })
    } else {
      state.hp = Math.max(0, state.hp - amount)
      events.push({ id: state.nextId++, kind: 'hurt', x: point[0], y: point[1], points: amount, lane: 0 })
    }
    // A short invulnerability window and knockback prevent crowd contact from
    // melting health — or from draining every shield in one second.
    for (const enemy of state.crops) {
      const dist = distance([enemy.x, enemy.y], point)
      if (enemy.hp > 0 && dist < 15) { const factor = 7 / Math.max(1, dist); enemy.x += (enemy.x - point[0] || 1) * factor; enemy.y += (enemy.y - point[1] || 1) * factor }
    }
  }
  for (const enemy of state.crops) {
    if (enemy.hp <= 0) continue
    if (distance([enemy.x, enemy.y], point) > 160) { placeAtEdge(state, enemy); continue }
    if (state.tick < (enemy.spawnAt ?? 0)) continue
    const dx = point[0] - enemy.x, dy = point[1] - enemy.y, dist = Math.max(.01, distance([enemy.x, enemy.y], point))
    if (enemy.elite && (state.tick + enemy.id) % 80 === 0) enemy.dashUntil = state.tick + 8
    const speed = (enemy.elite ? (state.tick < (enemy.dashUntil ?? -1) ? 1.7 : .42) : enemy.bass ? .2 : enemy.boss ? .38 : [.48, .85, .34, .3][enemy.kind]) * (1 + Math.min(1.5, state.tick / (FPS * 60) * .55)) * (modifier?.speed ?? 1)
    const approach = enemy.kind === 2 && !enemy.boss && dist < 28 ? (dist < 20 ? -.5 : 0) : 1
    const travel = Math.min(speed, dist) / dist * approach
    enemy.x += dx * travel; enemy.y += dy * travel
    if (enemy.bass) {
      if ((state.tick + enemy.id) % 48 === 0 && state.shots.length < 60) {
        for (let ring = 0; ring < 8; ring++) {
          const angle = ring / 8 * Math.PI * 2 + enemy.id
          state.shots.push({ id: state.nextId++, x: enemy.x, y: enemy.y, dx: Math.cos(angle) * 1.05, dy: Math.sin(angle) * 1.05, expires: state.tick + FPS * 5 })
        }
      }
      if ((state.tick + enemy.id) % 96 === 0) state.dangers.push({ id: state.nextId++, x: point[0], y: point[1], radius: 21, due: state.tick + 16 })
    } else if (enemy.boss && (state.tick + enemy.id) % 64 === 0) {
      state.dangers.push({ id: state.nextId++, x: point[0], y: point[1], radius: 15, due: state.tick + 16 })
    } else if (!enemy.boss && enemy.kind === 2 && state.tick > 5 * FPS && (state.tick + enemy.id) % 64 === 0 && dist < 65 && state.shots.length < 60) {
      state.shots.push({ id: state.nextId++, x: enemy.x, y: enemy.y, dx: dx / dist * 1.1, dy: dy / dist * 1.1, expires: state.tick + FPS * 5 })
    }
    if (distance([enemy.x, enemy.y], point) < (enemy.bass ? 10 : enemy.boss ? 9 : enemy.elite ? 7 : 5)) hurt(enemy.bass ? 20 : enemy.boss ? 24 : enemy.elite ? 20 : enemy.kind === 3 ? 18 : 12)
  }
  state.shots = state.shots.filter((shot) => {
    shot.x += shot.dx; shot.y += shot.dy
    if (distance([shot.x, shot.y], point) < 3.5) { hurt(14); return false }
    return shot.expires > state.tick && distance([shot.x, shot.y], point) < 180
  })
  state.dangers = state.dangers.filter((danger) => {
    if (state.tick < danger.due) return true
    events.push({ id: state.nextId++, kind: 'slam', x: danger.x, y: danger.y, radius: danger.radius, lane: 0 })
    if (distance([danger.x, danger.y], point) < danger.radius) hurt(26)
    return false
  })
  state.tick++
  offer(state)
  return { state, events }
}
export function replayFarm(day, frames, choices, surges = []) {
  if (!validDay(day) || !Array.isArray(frames) || !frames.length || !Array.isArray(choices) || choices.length > THRESHOLDS.length || !Array.isArray(surges) || surges.length > frames.length || !surges.every((tick, index) => Number.isInteger(tick) && tick >= 0 && tick < frames.length && (!index || tick > surges[index - 1]))) return null
  let state = createFarm(day), cursor = 0
  const surgeSet = new Set(surges)
  for (let tick = 0; tick < frames.length; tick++) {
    while (state.offered.length) {
      const choice = choices[cursor++]
      if (!choice || choice.tick !== state.tick) return null
      state = chooseTalent(state, choice.id)
      if (!state) return null
    }
    const result = stepFarm(state, frames[tick], surgeSet.has(tick))
    if (!result) return null
    state = result.state
  }
  if (cursor !== choices.length || state.hp > 0) return null
  return finishFarm(state, frames, choices, surges)
}

// The live client already simulated every frame. Build its result without
// replaying a long run on the render thread; the server still replays inputs.
export function finishFarm(state, frames, choices, surges) {
  if (state.hp > 0) return null
  return { day: state.day, frames, choices, surges, outcome: 'defeated', hp: state.hp, seconds: state.tick / FPS, score: state.score, maxCombo: state.maxCombo, harvested: state.harvested, bosses: state.bosses, elites: state.elites, blocks: state.blocks, maxShields: state.maxShields, coins: state.coins, xp: state.xp, gear: state.gear, stars: state.score >= 65000 ? 3 : state.score >= 22000 ? 2 : state.score > 0 ? 1 : 0 }
}
