import { BAND_CHARACTERS, migrateCharacterId } from './characterRoster.mjs'
import {
  RECOVERY,
  normalizePermanentLevels,
  permanentStats,
  validPermanentLevels,
} from './permanent.mjs'
import { FARM_RULESET, MONSTERS, regularMonsterKind } from './monsters.mjs'
import { routeSeed, todayRoute, validDay } from './calendar.mjs'
import { comboModifiers } from './schools.mjs'
export { todayRoute, validDay }
// 流派与跨流派组合技是数据层，但玩法上属于同一套规则，从这里一并导出给界面。
export * from './schools.mjs'
// MONSTERS 是一张常量表，这几个 id 每帧都要用：预取一次，避免每 tick 线性扫描。
const ELITE_MONSTER = MONSTERS.find((monster) => monster.id === 'elite')
const DRUM_BOSS = MONSTERS.find((monster) => monster.id === 'drum-boss')
const BASS_BOSS = MONSTERS.find((monster) => monster.id === 'bass-boss')
export const FPS = 16
export const MOVE_STEP = 3
// Every band member and piece of gear climbs to this level; reaching it on a
// matching pair unlocks that instrument's final form.
export const MAX_GEAR_LEVEL = 5
// How many instruments the opening deal offers.
export const STARTER_CHOICES = 3
// A run carries at most this many instruments and this many chips: once a kind
// is full the offers only deepen what you already carry.
export const MAX_EQUIPPED = 5
export const START = [50, 76]
// Keep the first recipe attainable, then grow the cost of each additional
// upgrade. XP is cumulative; picking a talent never discards overflow.
// Five levels per item means more picks before a form evolves, so each step
// costs less than before: the first evolution still lands inside a normal run.
// This table describes the first full loadout, not a cap on player levels.
// Runtime thresholds below continue the same curve beyond these 50 upgrades.
export const UPGRADE_STEPS = MAX_EQUIPPED * 2 * MAX_GEAR_LEVEL
// Pacing: the early levels must still arrive while the player is still
// learning to dodge, but the climb to a finished loadout has to last long
// enough that the build keeps changing. The flat term and the quadratic term
// are the two knobs; XP_LINEAR feeds the closed form below.
export const XP_FLAT = 12
export const XP_LINEAR = 24
export const XP_QUAD = 34
export const UPGRADE_XP = Array.from({ length: UPGRADE_STEPS }, (_, index) =>
  Math.round(XP_FLAT + XP_LINEAR * index + (XP_QUAD / 20) * index ** 2),
)
export const THRESHOLDS = UPGRADE_XP.map((_, index) =>
  UPGRADE_XP.slice(0, index + 1).reduce((sum, cost) => sum + cost, 0),
)
// Rounding the quadratic repeats every 20 levels. Summing its correction
// keeps arbitrary level thresholds exact without allocating an expanding table.
const XP_ROUNDING = [0]
for (let index = 0; index < 20; index++)
  XP_ROUNDING.push(
    XP_ROUNDING.at(-1) + 20 * Math.round((XP_QUAD * index * index) / 20) - XP_QUAD * index * index,
  )
export const farmUpgradeXp = (level) =>
  Math.round(XP_FLAT + XP_LINEAR * level + (XP_QUAD / 20) * level ** 2)
export function farmXpThreshold(completedUpgrades) {
  const n = completedUpgrades
  const correction = Math.floor(n / 20) * XP_ROUNDING[20] + XP_ROUNDING[n % 20]
  return (
    XP_FLAT * n +
    (XP_LINEAR / 2) * n * (n - 1) +
    Math.round((XP_QUAD * n * (n - 1) * (2 * n - 1) + 6 * correction) / 120)
  )
}
// Harvests stay flat for the first minute and a half: the opening is meant to
// be survived by moving, not out-levelled.
export const EXPERIENCE_STAGES = [
  { seconds: 0, multiplier: 1 },
  { seconds: 90, multiplier: 1.15 },
  { seconds: 180, multiplier: 1.4 },
  { seconds: 300, multiplier: 1.8 },
  { seconds: 480, multiplier: 2.4 },
]
export const MAX_BOSSES = 4
// A surge clears every shot and danger and grants a second of invulnerability,
// so it must cost far more than the kills it takes to refill the charge.
// Without this cooldown the button can be held down and a run lasts twice
// as long as one played without touching it. Ten seconds is the longest wait
// that still lets every committed balance route survive: the calm circular
// route dies at 80s on 2026-10-04 once the wait reaches fifteen.
export const SURGE_COOLDOWN = 10 * FPS
// Healing drops are limited: at most one pack on the field, one every
// HEAL_COOLDOWN, and each pack vanishes after HEAL_TTL. Without this the
// endless mode never ends once the build harvests faster than enemies hurt.
export const HEAL_COOLDOWN = 15 * FPS
export const HEAL_TTL = 10 * FPS
export const HEAL_WOUNDED = 0.8
// Shield pickups are rarer than healing: they absorb one hit each.
export const SHIELD_EVERY = 40
export const SHIELD_COOLDOWN = 45 * FPS
export const SHIELD_LIMIT = 3
const TALENT_DEFINITIONS = [
  {
    id: 'drum',
    kind: 'weapon',
    partner: 'range',
    color: '#edaa8e',
    description: '击败怪物，鼓点引爆周围怪群。',
    tag: '连锁爆破',
  },
  {
    id: 'orbit',
    kind: 'weapon',
    partner: 'tempo',
    color: '#b7a0dd',
    description: '旋转音符绕着你飞，碰到怪物就造成伤害，还能挡下飞来的弹幕。',
    tag: '旋转音刃',
  },
  {
    id: 'power',
    kind: 'weapon',
    partner: 'magnet',
    color: '#a5b7d1',
    description: '奏出低音光柱，击穿同列敌人。',
    tag: '贯穿攻击',
  },
  {
    id: 'echo',
    kind: 'weapon',
    partner: 'lucky',
    color: '#df9bb1',
    description: '追着怪物唱出高音箭雨，自动命中。',
    tag: '自动追踪',
  },
  {
    id: 'range',
    kind: 'chip',
    partner: 'drum',
    name: '共鸣音箱',
    icon: '◉',
    color: '#9ebf86',
    description: '鼓的爆破伤害更高，连锁更狠，配鼓手进化',
    tag: '爆破强化',
  },
  {
    id: 'tempo',
    kind: 'chip',
    partner: 'orbit',
    name: '节拍器',
    icon: '⚡',
    color: '#d9bb74',
    description: '所有攻击节奏更快（音刃转速、箭雨、光柱、号角、哨箭等），配吉他手进化',
    tag: '攻击速度',
  },
  {
    id: 'magnet',
    kind: 'chip',
    partner: 'power',
    name: '拾音器',
    icon: '🧲',
    color: '#91baac',
    description: '经验和金币从更远处飞来，配贝斯手进化',
    tag: '掉落磁吸',
  },
  {
    id: 'lucky',
    kind: 'chip',
    partner: 'echo',
    name: '安可徽章',
    icon: '★',
    color: '#dbbb6b',
    description: '金币与经验更多，并带来暴击，配主唱进化',
    tag: '暴击与收益',
  },
  {
    id: 'bell',
    kind: 'weapon',
    partner: 'sustain',
    color: '#8fb7d9',
    description: '每隔几秒向外扩散一圈星浪，推开并伤害身边怪群。',
    tag: '环形冲击',
  },
  {
    id: 'sustain',
    kind: 'chip',
    partner: 'bell',
    name: '延音踏板',
    icon: '◐',
    color: '#7fa8c4',
    description: '所有残留与减速持续更久，配键盘手进化',
    tag: '冲击强化',
  },
  {
    id: 'whistle',
    kind: 'weapon',
    partner: 'delay',
    color: '#9ac6b4',
    description: '吹哨射出会追着怪物飞的哨箭，穿透后留下淡淡音痕。',
    tag: '追踪哨箭',
  },
  {
    id: 'delay',
    kind: 'chip',
    partner: 'whistle',
    name: '延迟效果器',
    icon: '◑',
    color: '#84b3a2',
    description: '哨箭射得更快、飞得更久，音痕也更密，配长笛手进化',
    tag: '哨箭强化',
  },
  {
    id: 'sax',
    kind: 'weapon',
    partner: 'mute',
    color: '#d8a05f',
    description: '朝最近的怪吹出号角冲刺波，撞飞并拖慢一排怪。',
    tag: '冲刺音波',
  },
  {
    id: 'mute',
    kind: 'chip',
    partner: 'sax',
    name: '弱音器',
    icon: '◒',
    color: '#c08a4e',
    description: '被号角命中的怪拖慢更久，配萨克斯进化',
    tag: '拖慢强化',
  },
  {
    id: 'sampler',
    kind: 'weapon',
    partner: 'trigger',
    color: '#c0a2d8',
    description: '走过的地方埋下音爆采样，片刻后炸开一圈。',
    tag: '音爆地雷',
  },
  {
    id: 'trigger',
    kind: 'chip',
    partner: 'sampler',
    name: '触发器',
    icon: '◓',
    color: '#a585c4',
    description: '布设类攻击更快更密、伤害更高，配节拍鳄进化',
    tag: '地雷强化',
  },
  {
    id: 'deck',
    kind: 'weapon',
    partner: 'needle',
    color: '#9db9c9',
    description: '刮碟甩出宽音刃，命中后弹出回响弹。',
    tag: '刮碟音刃',
  },
  {
    id: 'needle',
    kind: 'chip',
    partner: 'deck',
    name: '唱针',
    icon: '◔',
    color: '#7c9cb0',
    description: '所有攻击伤害 +，回响弹更痛，配打碟机进化',
    tag: '音刃强化',
  },
  {
    id: 'synth',
    kind: 'weapon',
    partner: 'arp',
    name: '辅助合成器',
    icon: '🎚️',
    color: '#a8c9a0',
    description: '朝最近的怪扇形连发音浪，穿透一排怪。',
    tag: '扇形音浪',
  },
  {
    id: 'arp',
    kind: 'chip',
    partner: 'synth',
    name: '琶音器',
    icon: '◕',
    color: '#86ab7e',
    description: '扇形音浪伤害更高，配合成器进化',
    tag: '音浪强化',
  },
]
// Member identity comes from the same roster used by the shop and avatar.
export const TALENTS = TALENT_DEFINITIONS.map((talent) => {
  const character = BAND_CHARACTERS.find((item) => item.talentId === talent.id)
  return character
    ? { ...talent, characterId: character.id, name: character.name, icon: character.icon }
    : talent
})
// Picking a band member picks their instrument: a run opens already holding it,
// so the opening deal is a normal hand instead of a choice of three starters.
// Accepts either a character id (legacy ids included) or a raw weapon id, and
// returns null for anything unknown so callers fall back to the old behaviour.
export function starterTalent(characterId) {
  if (typeof characterId !== 'string') return null
  const character = BAND_CHARACTERS.find(
    (item) => item.id === (migrateCharacterId(characterId) ?? characterId),
  )
  const talent = TALENTS.find(
    (item) => item.kind === 'weapon' && item.id === (character?.talentId ?? characterId),
  )
  return talent ? talent.id : null
}
export const FULL_HEAL_CARD = {
  id: 'heal',
  kind: 'recovery',
  name: '恢复满血',
  icon: '❤️',
  color: '#e5a3ae',
  description: '立即恢复至生命上限。本次选择用于回血，不提升乐器或装备等级。',
  tag: '即时恢复',
}
// A full loadout exhausts the instrument and chip pool a couple of minutes in,
// and the run keeps leveling long after that. Late levels then deal one step of
// raw growth instead of repeating the same full heal until the run ends. The
// steps are sized like a fraction of a permanent level and only last this run.
// Each attribute climbs to MAX_STAT_LEVEL: the line stays short enough that a
// build still reads as its instruments, never as five maxed numbers.
export const MAX_STAT_LEVEL = 5
export const STAT_CARD_HP = 6
export const STAT_CARD_DAMAGE = 0.03
export const STAT_CARD_STRIDE = 0.01
// Healing drops are rare and capped, so restoring more of each one is worth a
// card without turning the run immortal: five levels reach +60%.
export const STAT_CARD_REMEDY = 0.12
// Damage reduction stays below the permanent armour branch so a run still ends.
export const STAT_CARD_GRIT = 0.04
const STAT_CARD_DEFINITIONS = [
  {
    id: 'vigor',
    kind: 'stat',
    stat: 'hp',
    name: '体魄',
    icon: '♡',
    color: '#e2878f',
    description: `生命上限 +${STAT_CARD_HP}，并立刻回复同样多的生命，不占用乐器与芯片槽位。`,
    tag: '生命上限',
    max: MAX_STAT_LEVEL,
    step: STAT_CARD_HP,
  },
  {
    id: 'overdrive',
    kind: 'stat',
    stat: 'power',
    name: '力量',
    icon: '♫',
    color: '#cfa46b',
    description: `所有乐器与音浪爆发的伤害 +${STAT_CARD_DAMAGE * 100}%。`,
    tag: '全部伤害',
    max: MAX_STAT_LEVEL,
    step: STAT_CARD_DAMAGE * 100,
  },
  {
    id: 'remedy',
    kind: 'stat',
    stat: 'remedy',
    name: '回复',
    icon: '✚',
    color: '#9ec49a',
    description: `吃到的回血道具多回复 ${STAT_CARD_REMEDY * 100}%。`,
    tag: '回血强化',
    max: MAX_STAT_LEVEL,
    step: STAT_CARD_REMEDY * 100,
  },
  {
    id: 'grit',
    kind: 'stat',
    stat: 'grit',
    name: '韧性',
    icon: '◇',
    color: '#8ea9c9',
    description: `受到的伤害 -${STAT_CARD_GRIT * 100}%。`,
    tag: '受伤减免',
    max: MAX_STAT_LEVEL,
    step: -STAT_CARD_GRIT * 100,
  },
  {
    id: 'footwork',
    kind: 'stat',
    stat: 'stride',
    name: '轻步',
    icon: '➜',
    color: '#8fb7a8',
    description: `移动速度 +${STAT_CARD_STRIDE * 100}%，键盘、鼠标与触控都生效。`,
    tag: '移动速度',
    max: MAX_STAT_LEVEL,
    step: STAT_CARD_STRIDE * 100,
  },
]
export const STAT_CARDS = STAT_CARD_DEFINITIONS
export const UPGRADE_CARDS = [...TALENTS, FULL_HEAL_CARD, ...STAT_CARDS]
// Growth lives in state.growth for this run only: the level a card sits at is
// the number of times it was picked, so the interface reads it off the run.
export const statCard = (id) => STAT_CARDS.find((card) => card.id === id)
export function statCardLevel(state, id) {
  const card = statCard(id)
  if (!card) return 0
  const level = state?.growth?.[card.stat]
  return Number.isFinite(level) ? level : 0
}
// A card at its cap leaves the pool; every other one is still dealable.
export function statCardsAvailable(state) {
  return STAT_CARDS.filter((card) => statCardLevel(state, card.id) < card.max)
}
export const HEAL_CARD_CHANCE = 0.25
// Attribute steps share the spare slot with the healing card instead of
// competing with the focused instrument, so a build still gets its recipe.
export const STAT_CARD_CHANCE = 0.08
export const RECIPES = [
  {
    weapon: 'drum',
    chip: 'range',
    name: '雷霆鼓组',
    icon: '🥁',
    description: '爆破范围大幅扩张，连锁伤害翻倍',
  },
  {
    weapon: 'orbit',
    chip: 'tempo',
    name: '星环电吉他',
    icon: '🎸',
    description: '八道音刃环绕，触碰伤害翻倍',
  },
  {
    weapon: 'power',
    chip: 'magnet',
    name: '黑洞贝斯',
    icon: '🎻',
    description: '黑洞大范围收割，全场经验涌向你',
  },
  {
    weapon: 'echo',
    chip: 'lucky',
    name: '星雨麦克风',
    icon: '🎤',
    description: '一次追击八只怪，全场降下暴击音雨',
  },
  {
    weapon: 'bell',
    chip: 'sustain',
    name: '银河键盘',
    icon: '🎹',
    description: '星浪连发三圈，范围与伤害大幅提升',
  },
  {
    weapon: 'whistle',
    chip: 'delay',
    name: '回音哨箭阵',
    icon: '🪈',
    description: '一次吹出多支哨箭，穿透更多，音痕连成一片',
  },
  {
    weapon: 'sax',
    chip: 'mute',
    name: '金焰萨克斯',
    icon: '🎷',
    description: '冲刺波贯穿全场，击退更远并长时间拖慢',
  },
  {
    weapon: 'sampler',
    chip: 'trigger',
    name: '爆音采样台',
    icon: '🎛️',
    description: '音爆连锁三连炸，炸开整片怪潮',
  },
  {
    weapon: 'deck',
    chip: 'needle',
    name: '黑胶风暴台',
    icon: '💿',
    description: '四片宽音刃环绕，回响弹连锁全场',
  },
  {
    weapon: 'synth',
    chip: 'arp',
    name: '棱镜合成器',
    icon: '🎚️',
    description: '扇形化为三道棱镜音浪，伤害翻倍',
  },
]
// Every calendar day plays under one modifier, drawn from the day seed so all
// players on that day share it and the leaderboard stays comparable.
export const FARM_MODIFIERS = [
  {
    id: 'calm',
    name: '慢板',
    icon: '☾',
    desc: '怪物少两成，但经验与金币多四成',
    wave: 0.8,
    reward: 1.4,
  },
  { id: 'swarm', name: '密潮', icon: '❋', desc: '每波怪物多五成，收割更爽', wave: 1.5 },
  { id: 'tough', name: '重甲', icon: '▣', desc: '怪物生命 +1，需要更硬的构筑', health: 1 },
  { id: 'swift', name: '急板', icon: '⚡', desc: '怪物移速快两成', speed: 1.2 },
  { id: 'golden', name: '丰收', icon: '🪙', desc: '金币与经验多五成', reward: 1.5 },
  {
    id: 'brisk',
    name: '短弓',
    icon: '♭',
    desc: '经验与金币奖励多两成',
    reward: 1.2,
  },
]
export const farmModifier = (day) =>
  FARM_MODIFIERS[routeSeed(day, 'farm-mod') % FARM_MODIFIERS.length]
export const evolved = (gear) =>
  RECIPES.filter(
    (recipe) => gear[recipe.weapon] >= MAX_GEAR_LEVEL && gear[recipe.chip] >= MAX_GEAR_LEVEL,
  ).map((recipe) => recipe.weapon)
const PITCHES = [60, 64, 67, 69, 72, 76]
export function farmMoveStep(state) {
  // Permanent growth adds a flat distance per second; run cards stay a ratio.
  return (
    MOVE_STEP * (1 + (state.growth?.stride ?? 0) * STAT_CARD_STRIDE) +
    permanentStats(state.permanent).speed / FPS
  )
}
export function clampPoint(previous, desired, step = MOVE_STEP) {
  const dx = desired[0] - previous[0],
    dy = desired[1] - previous[1],
    length = Math.hypot(dx, dy),
    scale = length > step ? step / length : 1,
    precision = step === MOVE_STEP ? 1 : 100
  return [
    Math.round((previous[0] + dx * scale) * precision) / precision,
    Math.round((previous[1] + dy * scale) * precision) / precision,
  ]
}
const random = (state) => {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
  return state.seed / 4294967296
}
// Allocation-free: the arena is wider than tall, so x keeps its horizontal scale.
const distance = (ax, ay, bx, by) =>
  Math.sqrt((ax - bx) * (ax - bx) * 0.7056 + (ay - by) * (ay - by))
// Keep the opening minute familiar, then increase pressure without spawning
// unbounded entities or letting movement speed grow past controllable levels.
// The horde has to keep up with a finished build, otherwise the late game
// stops being a fight for the mowing high and turns into a screensaver.
const enemyHealth = (tick, kind) =>
  1 +
  Math.floor(tick / 300) +
  Math.floor(Math.max(0, tick - FPS * 60) / (FPS * 30)) ** 2 +
  (kind === 3 ? 2 : 0)
// Spawn ring: monsters must appear outside whatever the build already covers,
// or a full loadout reaps them on the frame the protection ends. The ring still
// cannot grow without limit: past this point arrivals sit off screen and the
// player waits for a walk that never reads as an attack.
const SPAWN_RING_BASE = 52,
  SPAWN_RING_SPREAD = 16,
  SPAWN_RING_MAX = 118,
  // The walk from the ring into the build's coverage. Keeping it a fixed gap
  // rather than a ratio is what stops a maxed ring from starving the run:
  // arrivals still read as arrivals, but they reach the player quickly.
  SPAWN_RING_GAP = 14
// Frames a fresh arrival stays untouchable.
const SPAWN_GRACE = 12
// How far the build covers *every* direction at once, so arrivals can be placed
// beyond it. Only the sweeping attacks count: a fan, a horn or a drum blast is
// aimed at whatever is already close, so widening the ring for them only starves
// the run without making a single arrival more visible.
export function farmReach(state) {
  const gear = state.gear,
    area = 1,
    forms = evolved(gear)
  return Math.max(
    gear.bell
      ? (24 + gear.bell * 6 + gear.sustain * 3 + (forms.includes('bell') ? 10 : 0)) * area
      : 0,
    gear.deck ? (16 + gear.deck * 3) * area + 12 : 0,
    gear.orbit ? 13 + gear.orbit * 2 + 8 : 0,
  )
}
// Monsters always arrive a short walk outside the build's coverage, so a maxed
// ring still shows the horde closing in instead of reaping it on arrival.
export function farmSpawnRadius(state) {
  return Math.min(SPAWN_RING_MAX, Math.max(SPAWN_RING_BASE, farmReach(state) + SPAWN_RING_GAP))
}
// World coordinates have no arena walls. A short portal warning makes arrivals
// fair even when a wide desktop camera can see the surrounding spawn ring.
function placeAtEdge(state, enemy, respawn = false) {
  // Rewards belong to the monster's birth stage. Kiting it across a stage
  // boundary (or relocating it back into view) must not inflate its drop.
  if (respawn || enemy.xpStage === undefined)
    enemy.xpStage = EXPERIENCE_STAGES.findLastIndex((stage) => state.tick >= stage.seconds * FPS)
  const angle = random(state) * Math.PI * 2,
    radius = farmSpawnRadius(state) + random(state) * SPAWN_RING_SPREAD
  enemy.x = state.position[0] + (Math.cos(angle) * radius) / 0.84
  enemy.y = state.position[1] + Math.sin(angle) * radius
  // A beat and a half of immunity: long enough to read the arrival, short
  // enough that a wide build still reaps the ring on the next pulse.
  enemy.spawnAt = state.tick + SPAWN_GRACE
}
export function createFarm(day, permanent, starter) {
  const levels = Object.freeze(normalizePermanentLevels(permanent))
  const stats = permanentStats(levels)
  if (!validDay(day)) throw new Error('Invalid farm date')
  const modifier = farmModifier(day)
  const state = {
    day,
    permanent: levels,
    seed: routeSeed(day, 'farm-v3'),
    tick: 0,
    position: [...START],
    crops: [],
    loot: [],
    gear: Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])),
    xp: 0,
    level: 0,
    offered: [],
    score: 0,
    coins: 0,
    harvested: 0,
    bosses: 0,
    elites: 0,
    blocks: 0,
    maxShields: 0,
    combo: 0,
    maxCombo: 0,
    lastHarvest: -1000,
    charge: 0,
    nextId: 100,
    bellRings: 0,
    modifier: modifier.id,
    nextBoss: DRUM_BOSS.starts * FPS,
    nextBass: BASS_BOSS.starts * FPS,
    surgeUntil: -1,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    hurtUntil: 32,
    nextHeal: 0,
    nextShield: 0,
    shields: 0,
    lastHit: -Infinity,
    regenTicks: 0,
    shieldTicks: 0,
    aim: [1, 0],
    shots: [],
    dangers: [],
    trails: [],
    arrows: [],
    mines: [],
    nextWave: 48,
    nextSurge: 0,
    growth: { hp: 0, power: 0, stride: 0, remedy: 0, grit: 0 },
  }
  // The member's own instrument is free and level one; chips still have to be
  // earned. Nothing random is spent here, so a replay that knows the member
  // rebuilds the exact same opening loadout.
  const opening = starterTalent(starter)
  if (opening) state.gear[opening] = 1
  for (let id = 0; id < 16; id++) {
    const enemy = { id, x: 0, y: 0, kind: 0, hp: 1, maxHp: 1, regrow: -1, boss: false }
    placeAtEdge(state, enemy)
    state.crops.push(enemy)
  }
  // Keep a ready-to-harvest patch within the first sound wave.
  for (const [id, x, y] of [
    [64, 45, 72],
    [65, 55, 74],
    [66, 48, 83],
  ])
    state.crops.push({ id, x, y, kind: 0, hp: 1, maxHp: 1, regrow: -1, boss: false, xpStage: 0 })
  return state
}
export function orbitPositions(state) {
  const count = evolved(state.gear).includes('orbit')
    ? 8
    : state.gear.orbit
      ? 1 + state.gear.orbit
      : 0
  // The metronome spins the blades faster: haste is the only chip the
  // guitarist's own attack can feel.
  const speed = 0.18 + state.gear.tempo * 0.02
  return Array.from({ length: count }, (_, index) => {
    const angle = state.tick * speed + (index * Math.PI * 2) / count
    return [
      state.position[0] + (Math.cos(angle) * (13 + state.gear.orbit * 2)) / 0.84,
      state.position[1] + Math.sin(angle) * (13 + state.gear.orbit * 2),
    ]
  })
}
function dealRecovery(state, choices) {
  // Every instrument and chip maxed leaves the pool dry while the run keeps
  // leveling. A dry hand keeps the size of a normal one: the healing card
  // always leads, because a late run dies without it, and one step of raw
  // growth fills the rest, so levelling stays a choice instead of a reflex.
  // An empty hand would freeze the run, so this branch never deals nothing.
  if (!choices.length) {
    const hand = [FULL_HEAL_CARD.id]
    const growth = statCardsAvailable(state).map((card) => card.id)
    while (hand.length < STARTER_CHOICES && growth.length)
      hand.push(growth.splice(Math.floor(random(state) * growth.length), 1)[0])
    state.offered = hand
    return
  }
  // Preserve the focused recipe (and two starter weapons); healing is a
  // repeatable consumable and never takes an instrument or chip slot. It is
  // worth taking even at full health, because the next wave is what takes the
  // health away.
  if (random(state) < HEAL_CARD_CHANCE) {
    if (choices.length >= STARTER_CHOICES) choices[choices.length - 1] = FULL_HEAL_CARD.id
    else choices.push(FULL_HEAL_CARD.id)
    state.offered = choices
    return
  }
  // Otherwise the spare slot may carry one attribute step. It never touches
  // the focused instrument leading the hand, and a hand shorter than two
  // keeps its instrument instead, so no build loses its evolution to this.
  const growth = statCardsAvailable(state)
  if (growth.length && choices.length >= 2 && random(state) < STAT_CARD_CHANCE)
    choices[choices.length - 1] = growth[Math.floor(random(state) * growth.length)].id
  state.offered = choices
}
function offer(state) {
  if (state.xp < farmXpThreshold(state.level + 1) || state.hp <= 0) return
  // Ten instruments would flood the dialog: deal three starters instead, but
  // only when the run holds no weapon at all. A chosen member already carries
  // its instrument, so its first level-up is dealt like every later one.
  if (
    !state.level &&
    !TALENTS.some((talent) => talent.kind === 'weapon' && state.gear[talent.id] > 0)
  ) {
    const weapons = TALENTS.filter((talent) => talent.kind === 'weapon').map((talent) => talent.id)
    const starters = []
    while (starters.length < STARTER_CHOICES && weapons.length)
      starters.push(weapons.splice(Math.floor(random(state) * weapons.length), 1)[0])
    dealRecovery(state, starters)
    return
  }
  const carried = (kind) =>
    TALENTS.filter((talent) => talent.kind === kind && state.gear[talent.id] > 0).length
  const fits = (id) => {
    const talent = TALENTS.find((item) => item.id === id)
    if (state.gear[id] >= MAX_GEAR_LEVEL) return false
    return state.gear[id] > 0 || carried(talent.kind) < MAX_EQUIPPED
  }
  const available = TALENTS.filter((talent) => fits(talent.id)).map((talent) => talent.id)
  const choices = []
  const focus = TALENTS.filter(
    (talent) =>
      talent.kind === 'weapon' &&
      state.gear[talent.id] > 0 &&
      !(state.gear[talent.id] >= MAX_GEAR_LEVEL && state.gear[talent.partner] >= MAX_GEAR_LEVEL),
  ).sort((a, b) => state.gear[b.id] - state.gear[a.id])[0]
  if (focus) {
    const needed = state.gear[focus.id] < MAX_GEAR_LEVEL ? focus.id : focus.partner
    if (fits(needed)) {
      choices.push(needed)
      available.splice(available.indexOf(needed), 1)
    }
  }
  // Ten instruments would otherwise scatter every build: one offer deepens what
  // the player already has, the last one keeps the pool open.
  const owned = available.filter((id) => state.gear[id] > 0)
  const fresh = available.filter((id) => state.gear[id] === 0)
  while (choices.length < 3) {
    const pool =
      choices.length === 2 ? (fresh.length ? fresh : owned) : owned.length ? owned : fresh
    if (!pool.length) break
    choices.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0])
  }
  dealRecovery(state, choices)
}
export function chooseTalent(previous, id) {
  if (previous.hp <= 0 || !previous.offered.includes(id)) return null
  // Growth cards are run-only: they never touch the instrument, chip or
  // permanent levels, so nothing about them is saved past this run.
  const card = statCard(id)
  // A card past its cap is not a legal pick, so a replay that claims one is
  // rejected instead of growing the run past the level line.
  if (card && statCardLevel(previous, id) >= card.max) return null
  const growth = card
    ? { ...previous.growth, [card.stat]: statCardLevel(previous, id) + 1 }
    : previous.growth
  const state = {
    ...previous,
    gear:
      id === FULL_HEAL_CARD.id || card
        ? { ...previous.gear }
        : { ...previous.gear, [id]: previous.gear[id] + 1 },
    growth,
    // A wider health cap pays the same amount back at once, otherwise the card
    // reads as doing nothing until the next healing drop happens to land.
    maxHp: previous.maxHp + (card?.stat === 'hp' ? STAT_CARD_HP : 0),
    hp:
      id === FULL_HEAL_CARD.id
        ? previous.maxHp
        : previous.hp + (card?.stat === 'hp' ? STAT_CARD_HP : 0),
    regenTicks: id === FULL_HEAL_CARD.id ? 0 : previous.regenTicks,
    level: previous.level + 1,
    offered: [],
  }
  offer(state)
  return state
}
export function stepFarm(previous, point, useSurge = false) {
  const moveStep = farmMoveStep(previous)
  const fractionalMovement = moveStep !== MOVE_STEP
  if (
    previous.offered.length ||
    previous.hp <= 0 ||
    !Array.isArray(point) ||
    point.length !== 2 ||
    point.some(
      (value) =>
        !Number.isFinite(value) ||
        Math.abs(value) > 1e9 ||
        (fractionalMovement
          ? Math.abs(value * 100 - Math.round(value * 100)) > 1e-5
          : !Number.isSafeInteger(value)),
    ) ||
    Math.hypot(point[0] - previous.position[0], point[1] - previous.position[1]) >
      moveStep + Math.SQRT1_2 / (fractionalMovement ? 100 : 1) ||
    (useSurge && previous.charge < 100)
  )
    return null
  const state = {
    ...previous,
    position: [...point],
    aim:
      point[0] !== previous.position[0] || point[1] !== previous.position[1]
        ? [point[0] - previous.position[0], point[1] - previous.position[1]]
        : previous.aim,
    crops: previous.crops.filter((crop) => !crop.boss || crop.hp > 0).map((crop) => ({ ...crop })),
    loot: previous.loot.map((drop) => ({ ...drop })),
    shots: previous.shots.map((shot) => ({ ...shot })),
    dangers: previous.dangers.map((danger) => ({ ...danger })),
    trails: previous.trails.map((trail) => ({ ...trail })),
    arrows: (previous.arrows ?? []).map((arrow) => ({ ...arrow, cleared: [...arrow.cleared] })),
    mines: previous.mines.map((mine) => ({ ...mine })),
    offered: [],
  }
  const events = []
  const gear = state.gear
  const stats = permanentStats(state.permanent)
  let shieldReset = false
  const modifier = FARM_MODIFIERS.find((item) => item.id === state.modifier)
  const forms = evolved(gear)
  const boomFlow = gear.orbit && gear.drum
  // A long combo pushes the whole band. The band no longer carries a built-in
  // sound wave, so the tier rides on every instrument instead and still
  // rewards staying inside the horde instead of kiting.
  const frenzy = state.combo >= 60 ? 2 : state.combo >= 30 ? 1 : 0
  // Chips are universal stats first: area, haste, power, duration and residue
  // reach every attack. The matching pair only adds the evolution on top.
  const areaBonus = 1
  const hasteBonus = gear.tempo + gear.trigger
  const powerBonus = gear.needle + frenzy
  const durationBonus = gear.sustain + gear.delay
  const residueBonus = gear.delay
  // 跨流派组合技不占槽位：达成即自动生效，增益与上面的芯片加成同乘一处。
  const combo = comboModifiers(gear)
  const harvest = (crop, chain = false) => {
    if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) return
    crop.hp = 0
    crop.regrow = crop.boss
      ? Infinity
      : state.tick + Math.max(28, 60 - Math.floor(state.tick / 150))
    state.harvested++
    state.bosses += crop.boss ? 1 : 0
    state.elites += crop.elite ? 1 : 0
    state.combo = state.tick - state.lastHarvest <= FPS * 2 ? state.combo + 1 : 1
    state.maxCombo = Math.max(state.maxCombo, state.combo)
    state.lastHarvest = state.tick
    const multiplier = Math.min(5, 1 + Math.floor(state.combo / 10))
    const points =
      (crop.bass ? 2400 : crop.boss ? 1200 : crop.elite ? 320 : 40 + crop.kind * 10) * multiplier
    state.score += points
    state.charge = Math.min(
      100,
      state.charge + (crop.bass ? 60 : crop.boss ? 40 : crop.elite ? 12 : 4),
    )
    const reward = modifier?.reward ?? 1
    const xpMultiplier = EXPERIENCE_STAGES[crop.xpStage ?? 0].multiplier
    // Permanent wisdom is a flat bonus on top of the stage-scaled drop.
    const dropXp =
        Math.round(
          (crop.bass ? 110 : crop.boss ? 45 : crop.elite ? 20 : 4 + gear.lucky) *
            xpMultiplier *
            reward,
        ) + stats.xp,
      dropCoins = Math.round(
        (crop.bass ? 340 : crop.boss ? 200 : crop.elite ? 60 : 8 + crop.kind * 2 + gear.lucky * 5) *
          reward,
      )
    const existingDrop = state.loot.find(
      (drop) => !drop.heal && distance(drop.x, drop.y, crop.x, crop.y) < 3,
    )
    if (existingDrop) {
      existingDrop.xp += dropXp
      existingDrop.coins += dropCoins
    } else
      state.loot.push({ id: state.nextId++, x: crop.x, y: crop.y, xp: dropXp, coins: dropCoins })
    // One healing pack at a time, only while wounded, and on a long cooldown.
    const wounded = state.hp < state.maxHp * HEAL_WOUNDED
    if (
      state.tick >= state.nextHeal &&
      !state.loot.some((drop) => drop.heal) &&
      ((crop.boss && state.hp < state.maxHp) || (state.harvested % 16 === 0 && wounded))
    ) {
      state.loot.push({
        id: state.nextId++,
        x: crop.x,
        y: crop.y,
        xp: 0,
        coins: 0,
        heal: crop.bass ? 35 : crop.boss ? 30 : 18,
        expires: state.tick + HEAL_TTL,
      })
      state.nextHeal = state.tick + HEAL_COOLDOWN
    }
    if (
      state.tick >= state.nextShield &&
      state.harvested % SHIELD_EVERY === 0 &&
      !state.loot.some((drop) => drop.shield)
    ) {
      state.loot.push({ id: state.nextId++, x: crop.x, y: crop.y, xp: 0, coins: 0, shield: 1 })
      state.nextShield = state.tick + SHIELD_COOLDOWN
    }
    events.push({
      id: state.nextId++,
      kind: crop.boss ? 'boss' : 'harvest',
      x: crop.x,
      y: crop.y,
      points,
      lane: crop.kind,
      midi: PITCHES[crop.id % PITCHES.length],
      chain,
    })
    if (gear.drum) drumBlast(crop.x, crop.y, true)
    if (crop.boss)
      for (const drop of state.loot) {
        drop.x = state.position[0]
        drop.y = state.position[1]
      }
  }
  // Every hit this run lands harder once overload cards are picked; the
  // permanent power level stays the baseline they stack on. This also covers
  // the surge, which fires through the same damage path.
  const runDamage = (1 + statCardLevel(state, 'overdrive') * STAT_CARD_DAMAGE) * combo.damage
  const damage = (crop, amount, chain = false) => {
    if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) return
    const critical = gear.lucky > 0 && (crop.id + state.tick) % Math.max(3, 8 - gear.lucky) === 0
    // Permanent power is a flat hit bonus, applied after the run multipliers.
    const hit = amount * (critical ? 2 : 1) * runDamage + stats.damage
    crop.hp = Math.round((crop.hp - hit) * 100) / 100
    if (crop.hp <= 0) {
      crop.hp = 0.001
      harvest(crop, chain)
    } else events.push({ id: state.nextId++, kind: 'hit', x: crop.x, y: crop.y, lane: crop.kind })
  }
  const pulse = (radius, amount, kind = 'pulse') => {
    events.push({ id: state.nextId++, kind, x: point[0], y: point[1], radius, lane: 1 })
    for (const crop of state.crops)
      if (crop.hp > 0 && distance(crop.x, crop.y, point[0], point[1]) <= radius)
        damage(crop, amount)
  }
  // One drum beat, used both by a harvest and by the kit's own rhythm below.
  const drumBlast = (x, y, chain) => {
    const radius =
      (7 + gear.drum * 2 + (boomFlow ? 3 : 0) + (forms.includes('drum') ? 12 : 0)) *
      areaBonus *
      combo.blastArea
    events.push({ id: state.nextId++, kind: 'blast', x, y, radius, lane: 0 })
    for (const other of state.crops)
      if (other.hp > 0 && distance(other.x, other.y, x, y) <= radius)
        damage(
          other,
          ((2 + gear.drum * 2 + (boomFlow ? 1 : 0)) * (forms.includes('drum') ? 2 : 1) +
            powerBonus) *
            (1 + gear.range * 0.12) *
            combo.blast,
          chain,
        )
  }
  for (const crop of state.crops)
    if (!crop.boss && crop.hp <= 0 && state.tick >= crop.regrow) {
      crop.kind = regularMonsterKind(state.tick, FPS, crop.id)
      // A recycled slot always comes back as a regular monster, even if an elite
      // died in it — otherwise the crown and the elite rewards would stick.
      crop.elite = false
      crop.dashUntil = -1
      crop.windupUntil = -1
      crop.recoverUntil = -1
      crop.attackUntil = -1
      crop.dashDx = undefined
      crop.dashDy = undefined
      crop.slowUntil = -1
      crop.hp = enemyHealth(state.tick, crop.kind) + (modifier?.health ?? 0)
      crop.maxHp = crop.hp
      placeAtEdge(state, crop, true)
    }
  if (state.tick >= state.nextWave) {
    const count = Math.max(
      1,
      Math.round((2 + Math.floor(state.tick / 300)) * (modifier?.wave ?? 1)),
    )
    const regularCount = state.crops.filter((crop) => !crop.boss).length
    for (let index = 0; index < count && regularCount + index < 100; index++) {
      const id = state.nextId++,
        kind = regularMonsterKind(state.tick, FPS, id),
        hp = enemyHealth(state.tick, kind) + (modifier?.health ?? 0)
      const enemy = { id, x: 0, y: 0, kind, hp, maxHp: hp, regrow: -1, boss: false }
      placeAtEdge(state, enemy)
      state.crops.push(enemy)
    }
    // The opening minute belongs to the player: waves stay sparse until the
    // build has had a chance to come together.
    state.nextWave += state.tick < FPS * 90 ? 22 : 16
  }
  // Elites take a dead/free slot, or replace a distant ordinary monster when
  // all 100 slots are alive. An encounter must not depend on killing first.
  if (
    state.tick >= ELITE_MONSTER.starts * FPS &&
    state.tick % 72 === 0 &&
    state.crops.filter((crop) => crop.elite && crop.hp > 0).length < 5
  ) {
    const hp = (enemyHealth(state.tick, 3) + (modifier?.health ?? 0)) * 6 + 8
    const slot =
      state.crops.find((crop) => !crop.boss && crop.hp <= 0) ??
      (state.crops.filter((crop) => !crop.boss).length >= 100
        ? state.crops
            .filter((crop) => !crop.boss && !crop.elite)
            .sort(
              (a, b) =>
                distance(b.x, b.y, point[0], point[1]) - distance(a.x, a.y, point[0], point[1]),
            )[0]
        : undefined)
    if (slot) {
      slot.kind = 3
      slot.hp = hp
      slot.maxHp = hp
      slot.elite = true
      slot.dashUntil = -1
      slot.windupUntil = -1
      slot.recoverUntil = -1
      slot.attackUntil = -1
      slot.dashDx = undefined
      slot.dashDy = undefined
      slot.slowUntil = -1
      placeAtEdge(state, slot, true)
    } else if (state.crops.filter((crop) => !crop.boss).length < 100) {
      const elite = {
        id: state.nextId++,
        x: 0,
        y: 0,
        kind: 3,
        hp,
        maxHp: hp,
        regrow: -1,
        boss: false,
        elite: true,
        dashUntil: -1,
      }
      placeAtEdge(state, elite)
      state.crops.push(elite)
    }
  }
  if (state.tick >= state.nextBoss) {
    state.nextBoss += DRUM_BOSS.interval * FPS
    // Bass shares the boss cap, so an arrival due on this very tick reserves a
    // slot for it even though it spawns later in the same frame.
    const limit = state.nextBass <= state.tick ? MAX_BOSSES - 1 : MAX_BOSSES
    if (state.crops.filter((crop) => crop.boss).length < limit) {
      const index = state.bosses + state.crops.filter((crop) => crop.boss).length
      const maxHp = 65 + index * 45
      const boss = {
        id: state.nextId++,
        x: 0,
        y: 0,
        kind: 3,
        hp: maxHp,
        maxHp,
        regrow: -1,
        boss: true,
      }
      placeAtEdge(state, boss)
      state.crops.push(boss)
      events.push({ id: state.nextId++, kind: 'arrival', x: point[0], y: point[1], lane: 3 })
    }
  }
  // A slower, tankier boss joins later: it fires ring barrages and wide slams
  // instead of chasing, so late runs need movement instead of just damage.
  if (state.tick >= state.nextBass) {
    state.nextBass += BASS_BOSS.interval * FPS
    if (state.crops.filter((crop) => crop.boss).length < MAX_BOSSES) {
      const index = state.bosses + state.crops.filter((crop) => crop.boss).length
      const maxHp = 95 + index * 60
      const boss = {
        id: state.nextId++,
        x: 0,
        y: 0,
        kind: 3,
        hp: maxHp,
        maxHp,
        regrow: -1,
        boss: true,
        bass: true,
      }
      placeAtEdge(state, boss)
      state.crops.push(boss)
      events.push({
        id: state.nextId++,
        kind: 'arrival',
        x: point[0],
        y: point[1],
        lane: 3,
        bass: true,
      })
    }
  }
  // A surge asked for while the cooldown runs is simply dropped: the charge
  // stays full and the HUD shows the wait, so a replay of a spammed button
  // stays legal instead of failing the whole run.
  if (useSurge && state.tick >= state.nextSurge) {
    state.charge = 0
    state.nextSurge = state.tick + SURGE_COOLDOWN
    state.surgeUntil = state.tick + FPS * 3
    state.hurtUntil = Math.max(state.hurtUntil, state.tick + FPS)
    state.shots = []
    state.dangers = []
    pulse((38 + gear.range * 2) * areaBonus, 8 + gear.power + powerBonus, 'surge')
  }
  // The kit beats on its own instead of waiting for a first kill: the beat
  // lands on the nearest monster and blows up around it, so the drummer can
  // open a run without the basic wave that used to start every harvest.
  if (gear.drum && state.tick % Math.max(6, 20 - gear.drum * 3 - hasteBonus) === 0) {
    let target = null,
      nearest = Infinity
    for (const crop of state.crops) {
      if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
      const gap = distance(crop.x, crop.y, point[0], point[1])
      if (gap < nearest) {
        nearest = gap
        target = crop
      }
    }
    if (target && nearest <= (30 + gear.range * 6) * areaBonus) drumBlast(target.x, target.y, false)
  }
  // Seeking rain keeps its own rhythm now that nothing else can trigger it:
  // the same cadence the basic wave had, so haste chips and a surge still
  // speed the voice up.
  if (
    gear.echo &&
    state.tick % Math.max(3, 8 - gear.tempo - (state.tick < state.surgeUntil ? 2 : 0)) === 0
  ) {
    const targets = state.crops
      .filter(
        (crop) =>
          crop.hp > 0 &&
          state.tick >= (crop.spawnAt ?? 0) &&
          distance(crop.x, crop.y, point[0], point[1]) <= (forms.includes('echo') ? 52 : 38),
      )
      .sort(
        (a, b) => distance(a.x, a.y, point[0], point[1]) - distance(b.x, b.y, point[0], point[1]),
      )
      .slice(0, forms.includes('echo') ? 6 : gear.echo + 1)
    for (const crop of targets) {
      events.push({
        id: state.nextId++,
        kind: 'rain',
        x: crop.x,
        y: crop.y,
        fromX: point[0],
        fromY: point[1],
        lane: 3,
      })
      damage(crop, (gear.echo * (forms.includes('echo') ? 2 : 1) + powerBonus) * combo.rain)
    }
  }
  // Bass column: haste chips shorten the wait between two columns.
  if (gear.power && state.tick % Math.max(4, 10 - hasteBonus) === 0) {
    if (forms.includes('power')) {
      pulse(32, 4 + gear.power, 'blackhole')
      for (const drop of state.loot) {
        drop.x += (point[0] - drop.x) * 0.55
        drop.y += (point[1] - drop.y) * 0.55
      }
    } else {
      events.push({
        id: state.nextId++,
        kind: 'beam',
        x: point[0],
        y: point[1],
        radius: 8 + gear.power * 3,
        lane: 2,
      })
      for (const crop of state.crops)
        if (
          crop.hp > 0 &&
          Math.abs(crop.x - point[0]) <= (8 + gear.power * 3) * areaBonus &&
          Math.abs(crop.y - point[1]) <= 120
        )
          damage(crop, 5 + gear.power * 4 + powerBonus)
    }
  }
  // Echo whistle: the flutist whistles and steers the shot the way Star-Lord
  // steers his arrow — it chases a monster, pierces a couple of them, and only
  // leaves a fading note where it passed. Nothing harvests while standing still.
  if (gear.whistle) {
    const every = Math.max(7, 18 - gear.delay * 3 - hasteBonus)
    if (state.tick % every === 0) {
      const targets = state.crops
        .filter((crop) => crop.hp > 0 && state.tick >= (crop.spawnAt ?? 0))
        .sort(
          (a, b) => distance(a.x, a.y, point[0], point[1]) - distance(b.x, b.y, point[0], point[1]),
        )
      const count = 1 + Math.floor(gear.whistle / 3)
      for (let index = 0; index < count; index++) {
        const target = targets[index] ?? targets[0]
        const angle = target
          ? Math.atan2(target.y - point[1], (target.x - point[0]) * 0.84)
          : (index / count) * Math.PI * 2
        state.arrows.push({
          id: state.nextId++,
          x: point[0],
          y: point[1],
          angle,
          damage:
            (2 + gear.whistle * 2 + (forms.includes('whistle') ? 4 : 0) + powerBonus) *
            combo.residue,
          pierce: 2 + Math.floor(gear.whistle / 2) + (forms.includes('whistle') ? 2 : 0),
          expires: state.tick + FPS * (2 + durationBonus),
          homing: true,
          cleared: [],
        })
      }
      if (state.arrows.length > 8) state.arrows.splice(0, state.arrows.length - 8)
    }
  }
  // Arrows chase, pierce and leave a short note behind. Each one is capped in
  // flight and in lifetime so a long run cannot pile them up. One shortlist per
  // frame keeps a screen full of arrows from re-sorting the whole horde.
  const shortlist = state.crops
    .filter((crop) => crop.hp > 0 && state.tick >= (crop.spawnAt ?? 0))
    .sort((a, b) => distance(a.x, a.y, point[0], point[1]) - distance(b.x, b.y, point[0], point[1]))
    .slice(0, 8)
  const flying = []
  for (const arrow of state.arrows) {
    if (state.tick >= arrow.expires || arrow.pierce <= 0) continue
    let prey = null
    for (const crop of shortlist) {
      if (arrow.cleared.includes(crop.id)) continue
      if (
        !prey ||
        distance(crop.x, crop.y, arrow.x, arrow.y) < distance(prey.x, prey.y, arrow.x, arrow.y)
      )
        prey = crop
    }
    if (prey && arrow.homing) {
      const wanted = Math.atan2(prey.y - arrow.y, (prey.x - arrow.x) * 0.84)
      const turn = Math.atan2(Math.sin(wanted - arrow.angle), Math.cos(wanted - arrow.angle))
      arrow.angle += Math.max(-0.22, Math.min(0.22, turn))
    }
    const speed = 3.8 + gear.whistle * 0.5
    arrow.x += (Math.cos(arrow.angle) * speed) / 0.84
    arrow.y += Math.sin(arrow.angle) * speed
    if (prey && distance(prey.x, prey.y, arrow.x, arrow.y) <= 11) {
      damage(prey, arrow.damage)
      arrow.cleared.push(prey.id)
      arrow.pierce--
      state.trails.push({
        id: state.nextId++,
        x: arrow.x,
        y: arrow.y,
        damage: arrow.damage * 0.25,
        expires: state.tick + FPS,
      })
      if (arrow.pierce <= 0) continue
    }
    if (distance(arrow.x, arrow.y, point[0], point[1]) > 150) continue
    flying.push(arrow)
  }
  state.arrows = flying.slice(-8)
  state.trails = state.trails.filter((trail) => state.tick < trail.expires).slice(-12)
  for (const trail of state.trails) {
    if ((state.tick + trail.id) % 4) continue
    const radius =
      (10 + gear.delay * 2 + residueBonus + (forms.includes('whistle') ? 6 : 0)) * areaBonus
    for (const crop of state.crops) {
      if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
      if (distance(crop.x, crop.y, trail.x, trail.y) <= radius) damage(crop, trail.damage)
    }
  }
  // Star tambourine: a slow, wide ring that also pushes monsters away, so it
  // covers the builds that keep getting cornered.
  if (gear.bell) {
    const interval = Math.max(8, 22 - gear.sustain * 3 - hasteBonus)
    if (state.tick % interval === 0) state.bellRings = forms.includes('bell') ? 3 : 1
    if (state.bellRings > 0 && state.tick % 4 === 0) {
      state.bellRings--
      const radius =
        (18 + gear.bell * 4 + gear.sustain * 2 + (forms.includes('bell') ? 8 : 0)) * areaBonus
      events.push({ id: state.nextId++, kind: 'shock', x: point[0], y: point[1], radius, lane: 2 })
      for (const crop of state.crops) {
        if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
        const dist = distance(crop.x, crop.y, point[0], point[1])
        if (dist > radius) continue
        damage(
          crop,
          (3 + gear.bell * 2 + (forms.includes('bell') ? 4 : 0) + powerBonus) * combo.shock,
        )
        const factor = 6 / Math.max(1, dist)
        crop.x += (crop.x - point[0] || 1) * factor
        crop.y += (crop.y - point[1] || 1) * factor
      }
    }
  }
  // Directional instruments aim at the closest monster: fleeing players should
  // still hit something.
  const aimAt = () => {
    let target = null,
      nearest = Infinity
    for (const crop of state.crops) {
      if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
      const gap = distance(crop.x, crop.y, point[0], point[1])
      if (gap < nearest) {
        nearest = gap
        target = crop
      }
    }
    return target ? [target.x - point[0], target.y - point[1]] : (state.aim ?? [1, 0])
  }
  // Sax: a horn blast down the way you are heading, knocking the row back and
  // leaving it sluggish for a moment.
  if (gear.sax) {
    const every = Math.max(6, 22 - gear.mute * 2 - hasteBonus)
    if (state.tick % every === 0) {
      const dir = aimAt()
      const norm = Math.max(0.01, Math.hypot(dir[0], dir[1]))
      const heading = [dir[0] / norm, dir[1] / norm]
      const length = (30 + gear.mute * 6 + (forms.includes('sax') ? 10 : 0)) * areaBonus
      const half = 13 + gear.mute * 2
      events.push({
        id: state.nextId++,
        kind: 'horn',
        x: point[0],
        y: point[1],
        fromX: heading[0],
        fromY: heading[1],
        radius: length,
        lane: 2,
      })
      for (const crop of state.crops) {
        if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
        const vx = crop.x - point[0],
          vy = crop.y - point[1]
        const along = vx * heading[0] + vy * heading[1]
        const side = Math.abs(vx * -heading[1] + vy * heading[0])
        if (along < -4 || along > length || side > half + along * 0.9) continue
        damage(crop, (2 + gear.sax * 2 + (forms.includes('sax') ? 4 : 0) + powerBonus) * combo.horn)
        crop.slowUntil = state.tick + FPS * (forms.includes('sax') ? 3 : 2) + gear.mute * 6
        crop.x += heading[0] * (forms.includes('sax') ? 9 : 6)
        crop.y += heading[1] * (forms.includes('sax') ? 9 : 6)
      }
      // The blast also washes over whoever is already on top of the player.
      for (const crop of state.crops) {
        if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
        if (distance(crop.x, crop.y, point[0], point[1]) > 14) continue
        crop.slowUntil =
          state.tick + FPS * ((forms.includes('sax') ? 3 : 2) + durationBonus) + gear.mute * 6
      }
    }
  }
  // Sampler: plants a beat where the horde is heading, not merely underfoot.
  // Traps dropped behind the farmer never get stepped on once arrivals walk
  // in from outside the build's reach, which made the whole school a no-show.
  if (gear.sampler) {
    const every = Math.max(4, 11 - gear.trigger * 2 - hasteBonus)
    if (state.tick % every === 0) {
      let ahead = [point[0], point[1]]
      let nearest = null,
        closest = Infinity
      for (const crop of state.crops) {
        if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
        const far = distance(crop.x, crop.y, point[0], point[1])
        if (far < closest) {
          closest = far
          nearest = crop
        }
      }
      if (nearest) {
        const span = Math.max(1, closest),
          step = Math.min(18, span * 0.6)
        ahead = [
          point[0] + ((nearest.x - point[0]) * step) / span,
          point[1] + ((nearest.y - point[1]) * step) / span,
        ]
      }
      state.mines.push({
        id: state.nextId++,
        x: ahead[0],
        y: ahead[1],
        due: state.tick + FPS * 3,
        damage:
          (4 + gear.sampler * 3 + (forms.includes('sampler') ? 5 : 0) + powerBonus) * combo.mine,
        radius:
          (16 + gear.trigger * 3 + residueBonus * 2 + (forms.includes('sampler') ? 8 : 0)) *
          areaBonus,
      })
      if (state.mines.length > 16) state.mines.shift()
    }
  }
  state.mines = state.mines.filter((mine) => {
    // A mine is a trap, not a timer: it waits for something to walk into it,
    // and only fizzles out if the horde never comes near.
    if (state.tick < mine.due) {
      const touched = state.crops.some(
        (crop) =>
          crop.hp > 0 &&
          state.tick >= (crop.spawnAt ?? 0) &&
          distance(crop.x, crop.y, mine.x, mine.y) <= mine.radius * 0.9,
      )
      if (!touched) return true
    }
    events.push({
      id: state.nextId++,
      kind: 'mine',
      x: mine.x,
      y: mine.y,
      radius: mine.radius,
      lane: 2,
    })
    for (const crop of state.crops) {
      if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
      if (distance(crop.x, crop.y, mine.x, mine.y) > mine.radius) continue
      damage(crop, mine.damage)
      // The blast shoves survivors back: this build has no other way to keep
      // the ring off the farmer while the next mine is being laid.
      const push = 5 / Math.max(1, distance(crop.x, crop.y, mine.x, mine.y))
      crop.x += (crop.x - mine.x || 1) * push
      crop.y += (crop.y - mine.y || 1) * push * 0.6
    }
    return false
  })
  // DJ: wide scratch blades that also bounce a note into a nearby monster.
  if (gear.deck && state.tick % 3 === 0) {
    const blades = forms.includes('deck') ? 4 : 2
    const radius = (16 + gear.deck * 3) * areaBonus
    for (let index = 0; index < blades; index++) {
      const angle = state.tick * 0.12 + (index * Math.PI * 2) / blades
      const bx = point[0] + (Math.cos(angle) * radius) / 0.84,
        by = point[1] + Math.sin(angle) * radius
      for (const crop of state.crops) {
        if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
        if (distance(crop.x, crop.y, bx, by) > 12) continue
        damage(crop, (gear.deck + (forms.includes('deck') ? 3 : 1) + powerBonus) * combo.blade)
        if (!forms.includes('deck')) continue
        const other = state.crops.find(
          (target) =>
            target !== crop &&
            target.hp > 0 &&
            state.tick >= (target.spawnAt ?? 0) &&
            distance(target.x, target.y, crop.x, crop.y) <= 34,
        )
        if (!other) continue
        events.push({
          id: state.nextId++,
          kind: 'ricochet',
          x: crop.x,
          y: crop.y,
          fromX: other.x,
          fromY: other.y,
          lane: 3,
        })
        damage(other, (2 + gear.needle + powerBonus) * combo.ricochet)
      }
    }
  }
  // Synth: a fan of sound waves down the way you are heading.
  if (gear.synth) {
    const every = Math.max(6, 14 - gear.arp * 2 - Math.floor(hasteBonus / 2))
    if (state.tick % every === 0) {
      const dir = aimAt()
      const base = Math.atan2(dir[1], dir[0] * 0.84)
      const reach =
        (36 + gear.arp * 6 + (forms.includes('synth') ? 8 : 0)) * areaBonus * combo.fanArea
      const spread = 0.45 + gear.arp * 0.1 + (forms.includes('synth') ? 0.3 : 0)
      for (const offset of forms.includes('synth') ? [-0.32, 0, 0.32] : [0]) {
        const angle = base + offset
        events.push({
          id: state.nextId++,
          kind: 'fan',
          x: point[0],
          y: point[1],
          angle,
          spread,
          radius: reach,
          lane: 3,
        })
        for (const crop of state.crops) {
          if (crop.hp <= 0 || state.tick < (crop.spawnAt ?? 0)) continue
          if (distance(crop.x, crop.y, point[0], point[1]) > reach) continue
          const towards = Math.atan2(crop.y - point[1], (crop.x - point[0]) * 0.84)
          const off = Math.abs(((towards - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
          if (off > spread) continue
          damage(
            crop,
            (gear.synth + 1 + (forms.includes('synth') ? 2 : 0) + powerBonus) *
              (1 + gear.arp * 0.12) *
              combo.fan,
          )
        }
      }
    }
  }
  if (state.tick % 2 === 0)
    for (const orb of orbitPositions(state))
      for (const crop of state.crops)
        if (crop.hp > 0 && distance(crop.x, crop.y, orb[0], orb[1]) <= 9)
          damage(
            crop,
            ((1 + gear.orbit + (boomFlow ? 1 : 0)) * (forms.includes('orbit') ? 2 : 1) +
              powerBonus) *
              combo.orbit,
          )
  const attraction = (15 + gear.magnet * 15 + stats.attraction) * combo.attraction
  for (const drop of state.loot) {
    const dist = distance(drop.x, drop.y, point[0], point[1])
    if (dist <= attraction || state.tick < state.surgeUntil) {
      const amount = Math.min(1, (3 + gear.magnet * 1.5) / Math.max(0.01, dist))
      drop.x += (point[0] - drop.x) * amount
      drop.y += (point[1] - drop.y) * amount
    }
    if (distance(drop.x, drop.y, point[0], point[1]) <= 4) {
      state.xp = Math.round((state.xp + drop.xp) * 100) / 100
      state.coins += drop.coins
      if (drop.shield) {
        state.shieldTicks = 0
        shieldReset = true
        state.shields = Math.min(SHIELD_LIMIT, state.shields + drop.shield)
        state.maxShields = Math.max(state.maxShields, state.shields)
      }
      if (drop.heal) {
        // 回复 makes each drop give back more of the same pack.
        const boost = 1 + statCardLevel(state, 'remedy') * STAT_CARD_REMEDY
        const healed = Math.round(Math.min(drop.heal * boost, state.maxHp - state.hp) * 100) / 100
        state.hp = Math.round((state.hp + healed) * 100) / 100
        if (healed)
          events.push({
            id: state.nextId++,
            kind: 'heal',
            x: point[0],
            y: point[1],
            points: healed,
            lane: 1,
          })
      }
      drop.collected = true
      events.push({ id: state.nextId++, kind: 'collect', x: point[0], y: point[1], lane: 2 })
    }
  }
  state.loot = state.loot
    .filter(
      (drop) =>
        !drop.collected &&
        !(drop.expires && state.tick >= drop.expires) &&
        distance(drop.x, drop.y, point[0], point[1]) <= 240,
    )
    .slice(-600)
  const hurt = (amount) => {
    if (state.tick < state.hurtUntil || state.hp <= 0) return
    state.hurtUntil = state.tick + FPS
    state.lastHit = state.tick
    state.regenTicks = 0
    // Recharge rewards a sustained escape, never time spent taking damage.
    state.shieldTicks = 0
    shieldReset = true
    // A held shield eats the whole hit instead of reducing it.
    if (state.shields > 0) {
      state.shields--
      state.blocks++
      events.push({
        id: state.nextId++,
        kind: 'shield',
        x: point[0],
        y: point[1],
        points: amount,
        lane: 1,
      })
    } else {
      // 韧性 shaves every hit off the top, stacked on the permanent armour.
      const grit = 1 - statCardLevel(state, 'grit') * STAT_CARD_GRIT
      const taken = Math.round(Math.max(0, amount * grit - stats.armor) * 100) / 100
      state.hp = Math.max(0, Math.round((state.hp - taken) * 100) / 100)
      events.push({
        id: state.nextId++,
        kind: 'hurt',
        x: point[0],
        y: point[1],
        points: taken,
        lane: 0,
      })
    }
    // A short invulnerability window and knockback prevent crowd contact from
    // melting health — or from draining every shield in one second.
    for (const enemy of state.crops) {
      const dist = distance(enemy.x, enemy.y, point[0], point[1])
      if (enemy.hp > 0 && dist < 15) {
        const factor = 7 / Math.max(1, dist)
        enemy.x += (enemy.x - point[0] || 1) * factor
        enemy.y += (enemy.y - point[1] || 1) * factor
      }
    }
  }
  for (const enemy of state.crops) {
    if (enemy.hp <= 0) continue
    if (distance(enemy.x, enemy.y, point[0], point[1]) > 160) {
      placeAtEdge(state, enemy)
      continue
    }
    if (state.tick < (enemy.spawnAt ?? 0)) continue
    const dx = point[0] - enemy.x,
      dy = point[1] - enemy.y,
      dist = Math.max(0.01, distance(enemy.x, enemy.y, point[0], point[1]))
    const phase = state.tick + enemy.id
    const charger = enemy.elite || (!enemy.boss && enemy.kind === 1)
    if (
      charger &&
      phase % 80 === 0 &&
      dist >= 12 &&
      dist < 60 &&
      state.tick >= (enemy.dashUntil ?? -1)
    ) {
      enemy.windupUntil = state.tick + FPS / 2
      // Lock the direction during the warning; chasing the player mid-dash is unfair.
      enemy.dashDx = dx / dist
      enemy.dashDy = dy / dist
    }
    if (state.tick >= (enemy.windupUntil ?? Infinity) && (enemy.windupUntil ?? -1) >= 0) {
      enemy.windupUntil = -1
      enemy.dashUntil = state.tick + FPS / 2
      enemy.recoverUntil = enemy.dashUntil + FPS / 2
    }
    const winding = state.tick < (enemy.windupUntil ?? -1)
    const dashing = state.tick < (enemy.dashUntil ?? -1)
    const recovering = !dashing && state.tick < (enemy.recoverUntil ?? -1)
    const speed =
      (enemy.elite
        ? dashing
          ? 1.7
          : 0.42
        : enemy.bass
          ? 0.2
          : enemy.boss
            ? 0.38
            : enemy.kind === 1 && dashing
              ? 1.65
              : [0.48, 0.85, 0.34, 0.3][enemy.kind]) *
      (1 + Math.min(1.5, (state.tick / (FPS * 60)) * 0.55)) *
      (modifier?.speed ?? 1) *
      (state.tick < (enemy.slowUntil ?? -1) ? 0.45 : 1)
    const approach = enemy.kind === 2 && !enemy.boss && dist < 28 ? (dist < 20 ? -0.5 : 0) : 1
    const stationary = winding || recovering || state.tick < (enemy.attackUntil ?? -1)
    if (!stationary) {
      if (charger && dashing) {
        enemy.x += (enemy.dashDx ?? dx / dist) * speed
        enemy.y += (enemy.dashDy ?? dy / dist) * speed
      } else {
        const travel = (Math.min(speed, dist) / dist) * approach
        enemy.x += dx * travel
        enemy.y += dy * travel
      }
    }
    // All volleys share a hard cap, including a ring fired with only one slot left.
    const volley = (angles, velocity, damage = 14, kind = 'noise') => {
      for (const angle of angles) {
        if (state.shots.length >= 60) break
        state.shots.push({
          id: state.nextId++,
          x: enemy.x,
          y: enemy.y,
          dx: (Math.cos(angle) * velocity) / 0.84,
          dy: Math.sin(angle) * velocity,
          expires: state.tick + FPS * 5,
          damage,
          kind,
        })
      }
    }
    const aimed = Math.atan2(dy, dx * 0.84)
    if (enemy.elite && enemy.dashUntil === state.tick && state.tick >= 90 * FPS)
      volley(
        Array.from({ length: 6 }, (_, index) => (index * Math.PI) / 3 + enemy.id),
        0.9,
        12,
        'record',
      )
    if (enemy.bass) {
      if (phase % 48 === 0)
        volley(
          Array.from({ length: 8 }, (_, index) => (index * Math.PI) / 4 + enemy.id),
          1.05,
          14,
          'bass',
        )
      if (phase % 96 === 0)
        state.dangers.push({
          id: state.nextId++,
          x: point[0],
          y: point[1],
          radius: 21,
          due: state.tick + FPS,
        })
    } else if (enemy.boss && phase % 64 === 0) {
      state.dangers.push({
        id: state.nextId++,
        x: point[0],
        y: point[1],
        radius: 15,
        due: state.tick + FPS,
      })
      if (state.tick >= 120 * FPS)
        state.dangers.push({
          id: state.nextId++,
          x: point[0] + state.aim[0] * 4,
          y: point[1] + state.aim[1] * 4,
          radius: 12,
          due: state.tick + FPS * 2,
        })
    } else if (!enemy.boss && !enemy.elite && enemy.kind === 3 && phase % 96 === 0 && dist < 24) {
      enemy.attackUntil = state.tick + FPS
      state.dangers.push({
        id: state.nextId++,
        x: enemy.x,
        y: enemy.y,
        radius: 11,
        due: state.tick + FPS,
        damage: 18,
        sourceId: enemy.id,
      })
    } else if (
      !enemy.boss &&
      !enemy.elite &&
      enemy.kind === 2 &&
      state.tick > 5 * FPS &&
      phase % 64 === 0 &&
      dist < 65
    ) {
      const offsets = state.tick >= 120 * FPS ? [-0.2, 0, 0.2] : [0]
      volley(
        offsets.map((offset) => aimed + offset),
        1.1,
      )
    }
    if (
      distance(enemy.x, enemy.y, point[0], point[1]) <
      (enemy.bass ? 10 : enemy.boss ? 9 : enemy.elite ? 7 : 5)
    )
      hurt(enemy.bass ? 20 : enemy.boss ? 24 : enemy.elite ? 20 : enemy.kind === 3 ? 18 : 12)
  }
  // The guitarist's orbiting notes swat ranged shots out of the air.
  const orbs = gear.orbit ? orbitPositions(state) : null
  state.shots = state.shots.filter((shot) => {
    shot.x += shot.dx
    shot.y += shot.dy
    if (orbs?.some((orb) => distance(shot.x, shot.y, orb[0], orb[1]) <= 6)) {
      state.blocks++
      events.push({ id: state.nextId++, kind: 'block', x: shot.x, y: shot.y, lane: 3 })
      return false
    }
    if (distance(shot.x, shot.y, point[0], point[1]) < 3.5) {
      hurt(shot.damage ?? 14)
      return false
    }
    return shot.expires > state.tick && distance(shot.x, shot.y, point[0], point[1]) < 180
  })
  state.dangers = state.dangers.filter((danger) => {
    if (
      danger.sourceId !== undefined &&
      !state.crops.some(
        (enemy) =>
          enemy.id === danger.sourceId &&
          enemy.hp > 0 &&
          !enemy.elite &&
          !enemy.boss &&
          enemy.kind === 3 &&
          state.tick >= (enemy.spawnAt ?? 0),
      )
    )
      return false
    if (state.tick < danger.due) return true
    events.push({
      id: state.nextId++,
      kind: 'slam',
      x: danger.x,
      y: danger.y,
      radius: danger.radius,
      lane: 0,
    })
    if (distance(danger.x, danger.y, point[0], point[1]) < danger.radius) hurt(danger.damage ?? 26)
    return false
  })
  // Recover only after all attacks resolve; a lethal hit cannot be undone.
  if (state.hp > 0) {
    if (state.hp >= state.maxHp) state.regenTicks = 0
    else if (stats.regen && state.tick - state.lastHit > FPS * RECOVERY.safeSeconds) {
      state.regenTicks++
      if (state.regenTicks >= FPS * RECOVERY.regenSeconds) {
        const healed = Math.min(stats.regen, state.maxHp - state.hp)
        state.hp = Math.round((state.hp + healed) * 100) / 100
        state.regenTicks = 0
        events.push({
          id: state.nextId++,
          kind: 'heal',
          x: point[0],
          y: point[1],
          points: healed,
          lane: 1,
        })
      }
    }
    if (state.shields) state.shieldTicks = 0
    else if (stats.shieldSeconds) {
      // A shield broken on this frame starts its empty timer on the next frame.
      if (previous.shields === 0 && !shieldReset) state.shieldTicks++
      if (state.shieldTicks >= stats.shieldSeconds * FPS) {
        state.shields = 1
        state.maxShields = Math.max(state.maxShields, 1)
        state.shieldTicks = 0
        events.push({
          id: state.nextId++,
          kind: 'block',
          x: point[0],
          y: point[1],
          points: 1,
          lane: 1,
        })
      }
    }
  }
  state.tick++
  offer(state)
  return { state, events }
}
export function replayFarm(day, frames, choices, surges = [], permanent = {}, characterId) {
  if (
    !validDay(day) ||
    !validPermanentLevels(permanent) ||
    !Array.isArray(frames) ||
    !frames.length ||
    !Array.isArray(choices) ||
    !Array.isArray(surges) ||
    surges.length > frames.length ||
    !surges.every(
      (tick, index) =>
        Number.isInteger(tick) &&
        tick >= 0 &&
        tick < frames.length &&
        (!index || tick > surges[index - 1]),
    )
  )
    return null
  let state = createFarm(day, permanent, characterId),
    cursor = 0
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
  return {
    ruleset: FARM_RULESET,
    day: state.day,
    permanent: state.permanent,
    frames,
    choices,
    surges,
    outcome: 'defeated',
    hp: state.hp,
    seconds: state.tick / FPS,
    score: state.score,
    maxCombo: state.maxCombo,
    harvested: state.harvested,
    bosses: state.bosses,
    elites: state.elites,
    blocks: state.blocks,
    maxShields: state.maxShields,
    coins: state.coins,
    xp: state.xp,
    gear: state.gear,
    stars: state.score >= 65000 ? 3 : state.score >= 22000 ? 2 : state.score > 0 ? 1 : 0,
  }
}
