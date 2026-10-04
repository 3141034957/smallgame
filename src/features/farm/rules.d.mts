import type { Lane } from '../melody/engine'
export { todayRoute, validDay } from '../island/rules.mjs'
export const FPS: number
export type FarmModifier = { id: string; name: string; icon: string; desc: string; wave?: number; health?: number; speed?: number; reward?: number; boss?: number }
export const FARM_MODIFIERS: FarmModifier[]
export function farmModifier(day: string): FarmModifier
export const MAX_BOSSES: number
export const HEAL_COOLDOWN: number
export const HEAL_TTL: number
export const HEAL_WOUNDED: number
export const SHIELD_EVERY: number
export const SHIELD_COOLDOWN: number
export const SHIELD_LIMIT: number
export const MOVE_STEP: number
export const START: Point
export const THRESHOLDS: number[]
export type Point = [number, number]
export type TalentId = 'drum' | 'orbit' | 'magnet' | 'range' | 'tempo' | 'power' | 'echo' | 'lucky' | 'bell' | 'sustain' | 'whistle' | 'delay'
export const TALENTS: { id: TalentId; kind: 'weapon' | 'chip'; partner: TalentId; name: string; icon: string; color: string; description: string; tag: string }[]
export const RECIPES: { weapon: TalentId; chip: TalentId; name: string; icon: string; description: string }[]
export function evolved(gear: Gear): TalentId[]
export type Gear = Record<TalentId, number>
export type Crop = { id: number; x: number; y: number; kind: Lane; hp: number; maxHp: number; regrow: number; boss: boolean; bass?: boolean; elite?: boolean; dashUntil?: number; spawnAt?: number }
export type Loot = { id: number; x: number; y: number; xp: number; coins: number; heal?: number; shield?: number; expires?: number }
export type FarmEvent = { id: number; kind: 'harvest' | 'boss' | 'blast' | 'pulse' | 'echo' | 'surge' | 'arrival' | 'hit' | 'collect' | 'rain' | 'beam' | 'blackhole' | 'hurt' | 'heal' | 'slam' | 'shield' | 'shock'; x: number; y: number; lane: Lane; midi?: number; points?: number; radius?: number; chain?: boolean; fromX?: number; fromY?: number; bass?: boolean }
export type Shot = { id: number; x: number; y: number; dx: number; dy: number; expires: number }
export type Danger = { id: number; x: number; y: number; radius: number; due: number }
export type Trail = { id: number; x: number; y: number; damage: number; expires: number }
export type FarmState = { day: string; seed: number; tick: number; position: Point; crops: Crop[]; loot: Loot[]; gear: Gear; xp: number; level: number; offered: TalentId[]; score: number; coins: number; harvested: number; bosses: number; elites: number; blocks: number; maxShields: number; combo: number; maxCombo: number; lastHarvest: number; charge: number; nextId: number; lastPulse: number; echoDue: number; bellRings: number; nextBoss: number; nextBass: number; modifier: string; surgeUntil: number; hp: number; maxHp: number; hurtUntil: number; nextHeal: number; nextShield: number; shields: number; shots: Shot[]; dangers: Danger[]; trails: Trail[]; nextWave: number }
export type Choice = { tick: number; id: TalentId }
export type FarmRound = { outcome: 'defeated'; hp: number; seconds: number; day: string; frames: Point[]; choices: Choice[]; surges: number[]; score: number; maxCombo: number; harvested: number; bosses: number; elites: number; blocks: number; maxShields: number; coins: number; xp: number; gear: Gear; stars: number }
export function clampPoint(previous: Point, desired: Point): Point
export function synergies(gear: Gear): string[]
export function createFarm(day: string): FarmState
export function orbitPositions(state: FarmState): Point[]
export function chooseTalent(state: FarmState, id: TalentId): FarmState | null
export function stepFarm(state: FarmState, point: Point, useSurge?: boolean): { state: FarmState; events: FarmEvent[] } | null
export function replayFarm(day: string, frames: Point[], choices: Choice[], surges?: number[]): FarmRound | null
export function finishFarm(state: FarmState, frames: Point[], choices: Choice[], surges: number[]): FarmRound | null
