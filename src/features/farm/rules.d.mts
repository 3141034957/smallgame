export type Lane = 0 | 1 | 2 | 3
import type { PermanentLevels } from './permanent.mjs'
export { todayRoute, validDay } from './calendar.mjs'
export const FPS: number
export type FarmModifier = {
  id: string
  name: string
  icon: string
  desc: string
  wave?: number
  health?: number
  speed?: number
  reward?: number
}
export const FARM_MODIFIERS: FarmModifier[]
export function farmModifier(day: string): FarmModifier
export const MAX_BOSSES: number
export const SURGE_COOLDOWN: number
export const MAX_GEAR_LEVEL: number
export const STARTER_CHOICES: number
export const MAX_EQUIPPED: number
export const UPGRADE_STEPS: number
export const HEAL_COOLDOWN: number
export const HEAL_TTL: number
export const HEAL_WOUNDED: number
export const SHIELD_EVERY: number
export const SHIELD_COOLDOWN: number
export const SHIELD_LIMIT: number
export const MOVE_STEP: number
export const START: Point
export const THRESHOLDS: number[]
export const UPGRADE_XP: number[]
export function farmUpgradeXp(level: number): number
export function farmXpThreshold(completedUpgrades: number): number
export const HEAL_CARD_CHANCE: number
export const EXPERIENCE_STAGES: { seconds: number; multiplier: number }[]
export type Point = [number, number]
export type TalentId =
  | 'drum'
  | 'orbit'
  | 'magnet'
  | 'range'
  | 'tempo'
  | 'power'
  | 'echo'
  | 'lucky'
  | 'bell'
  | 'sustain'
  | 'whistle'
  | 'delay'
  | 'sax'
  | 'mute'
  | 'sampler'
  | 'trigger'
  | 'deck'
  | 'needle'
  | 'synth'
  | 'arp'
export const TALENTS: {
  id: TalentId
  characterId?: string
  kind: 'weapon' | 'chip'
  partner: TalentId
  name: string
  icon: string
  color: string
  description: string
  tag: string
}[]
export type UpgradeId = TalentId | 'heal' | StatCardId
export const FULL_HEAL_CARD: {
  id: 'heal'
  kind: 'recovery'
  name: string
  icon: string
  color: string
  description: string
  tag: string
}
// Late levels past a full loadout grow the player one step at a time, and the
// growth lasts for that run only.
export type StatCardId = 'vigor' | 'overdrive' | 'footwork'
export const STAT_CARD_HP: number
export const STAT_CARD_DAMAGE: number
export const STAT_CARD_STRIDE: number
export const STAT_CARDS: {
  id: StatCardId
  kind: 'stat'
  stat: 'hp' | 'power' | 'stride'
  name: string
  icon: string
  color: string
  description: string
  tag: string
}[]
export const UPGRADE_CARDS: (
  (typeof TALENTS)[number] | typeof FULL_HEAL_CARD | (typeof STAT_CARDS)[number]
)[]
export const RECIPES: {
  weapon: TalentId
  chip: TalentId
  name: string
  icon: string
  description: string
}[]
export function evolved(gear: Gear): TalentId[]
// 流派与跨流派组合技的类型以 schools.d.mts 为准，rules.mjs 只是把它们一并转出，
// 所以这里复用同一份声明，避免界面从两个入口拿到不同的形状。
import type { Combo, ComboProgress, ComboSource, School, SchoolProgress } from './schools.mjs'
export type { Combo, ComboProgress, ComboSource, School, SchoolProgress }
// 界面直接用的两张表：流派表与组合技表。
export const SCHOOLS: School[]
export function schools(): School[]
export function schoolProgress(state: FarmState | Gear): SchoolProgress[]
// 跨流派组合技：达成即自动生效，不占槽位。
export const COMBOS: Combo[]
export function activeCombos(state: FarmState | Gear): Combo[]
export function comboModifiers(state: FarmState | Gear): Record<string, number>
// 差一点就达成的组合技，missing 是一句中文提示。
export type NearCombo = { id: string; name: string; icon: string; missing: string }
export function nearCombos(state: FarmState | Gear): NearCombo[]
export function comboProgress(state: FarmState | Gear): {
  active: Combo[]
  near: NearCombo[]
  evolvedSchools: number
}
export type Gear = Record<TalentId, number>
export type Crop = {
  id: number
  x: number
  y: number
  kind: Lane
  hp: number
  maxHp: number
  regrow: number
  boss: boolean
  bass?: boolean
  elite?: boolean
  windupUntil?: number
  recoverUntil?: number
  attackUntil?: number
  dashDx?: number
  dashDy?: number
  dashUntil?: number
  spawnAt?: number
  xpStage?: number
  slowUntil?: number
}
export type Loot = {
  id: number
  x: number
  y: number
  xp: number
  coins: number
  heal?: number
  shield?: number
  expires?: number
}
export type FarmEvent = {
  id: number
  kind:
    | 'harvest'
    | 'boss'
    | 'blast'
    | 'pulse'
    | 'echo'
    | 'surge'
    | 'arrival'
    | 'hit'
    | 'collect'
    | 'rain'
    | 'beam'
    | 'blackhole'
    | 'hurt'
    | 'heal'
    | 'slam'
    | 'shield'
    | 'shock'
    | 'block'
    | 'horn'
    | 'mine'
    | 'fan'
    | 'ricochet'
  x: number
  y: number
  lane: Lane
  midi?: number
  points?: number
  radius?: number
  chain?: boolean
  fromX?: number
  fromY?: number
  bass?: boolean
  angle?: number
  spread?: number
}
export type Shot = {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  expires: number
  damage?: number
  kind?: string
}
export type Danger = {
  id: number
  x: number
  y: number
  radius: number
  due: number
  damage?: number
  sourceId?: number
}
export type Trail = { id: number; x: number; y: number; damage: number; expires: number }
export type Mine = { id: number; x: number; y: number; due: number; damage: number; radius: number }
export type FarmState = {
  day: string
  permanent: PermanentLevels
  lastHit: number
  regenTicks: number
  shieldTicks: number
  seed: number
  tick: number
  position: Point
  crops: Crop[]
  loot: Loot[]
  gear: Gear
  xp: number
  level: number
  offered: UpgradeId[]
  score: number
  coins: number
  harvested: number
  bosses: number
  elites: number
  blocks: number
  maxShields: number
  combo: number
  maxCombo: number
  lastHarvest: number
  charge: number
  nextSurge: number
  growth: { hp: number; power: number; stride: number }
  nextId: number
  lastPulse: number
  echoDue: number
  bellRings: number
  nextBoss: number
  nextBass: number
  modifier: string
  surgeUntil: number
  hp: number
  maxHp: number
  hurtUntil: number
  nextHeal: number
  nextShield: number
  shields: number
  aim: Point
  shots: Shot[]
  dangers: Danger[]
  trails: Trail[]
  mines: Mine[]
  nextWave: number
}
export type Choice = { tick: number; id: UpgradeId }
export type FarmRound = {
  permanent?: PermanentLevels
  outcome: 'defeated'
  hp: number
  seconds: number
  day: string
  frames: Point[]
  choices: Choice[]
  surges: number[]
  score: number
  maxCombo: number
  harvested: number
  bosses: number
  elites: number
  blocks: number
  maxShields: number
  coins: number
  xp: number
  gear: Gear
  stars: number
}
export function farmMoveStep(state: FarmState): number
export function clampPoint(previous: Point, desired: Point, step?: number): Point
export function synergies(gear: Gear): string[]
export function createFarm(day: string, permanent?: Partial<PermanentLevels>): FarmState
export function orbitPositions(state: FarmState): Point[]
export function chooseTalent(state: FarmState, id: UpgradeId): FarmState | null
export function stepFarm(
  state: FarmState,
  point: Point,
  useSurge?: boolean,
): { state: FarmState; events: FarmEvent[] } | null
export function replayFarm(
  day: string,
  frames: Point[],
  choices: Choice[],
  surges?: number[],
  permanent?: Partial<PermanentLevels>,
): FarmRound | null
export function finishFarm(
  state: FarmState,
  frames: Point[],
  choices: Choice[],
  surges: number[],
): FarmRound | null
