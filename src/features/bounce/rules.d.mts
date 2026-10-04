import type { Lane } from '../melody/engine'
export type Aim = { angle: number; power: number }
export type GardenNode = { id: number; x: number; y: number; radius: number; lane: Lane; kind: 'note' | 'burst' | 'gold'; hit: boolean }
export type HitEvent = { t: number; id: number; x: number; y: number; lane: Lane; midi: number; points: number; total: number; combo: number; kind: 'note' | 'burst' | 'gold' | 'fever' | 'skill' | 'portal' | 'chorus'; chain: boolean; fever: boolean; origin?: { x: number; y: number } }
export type ShotResult = { score: number; combo: number; fevers: number; hits: number; duration: number; events: HitEvent[]; path: { t: number; x: number; y: number; jump?: boolean }[] }
export type BounceRound = { day: string; shots: Aim[]; score: number; maxCombo: number; fevers: number; hits: number; stars: number }
export const WIDTH: number
export const HEIGHT: number
export const LAUNCH: { x: number; y: number }
export const BALL_RADIUS: number
export const SHOTS: number
export const STEP: number
export const MAX_TIME: number
export const DEFAULT_AIM: Aim
export function validAim(aim: unknown): aim is Aim
export function aimFromDrag(dx: number, dy: number): Aim
export function makeGarden(day: string, shotIndex?: number): GardenNode[]
export function simulateShot(day: string, shotIndex: number, aim: Aim, includePath?: boolean): ShotResult | null
export function replayRound(day: string, shots: Aim[]): BounceRound | null
export function validDay(day: unknown): day is string
export function todayRoute(): string
