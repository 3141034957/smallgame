import type { Lane } from '../melody/engine'
export type IslandAction = { type: 'move'; cell: number } | { type: 'invite' } | { type: 'spell'; id: string } | { type: 'finish' }
export type IslandNote = { lane: Lane; cell: number; midi: number }
export type Journey = { islandId: string; day: string; position: number; steps: number; tiles: { cell: number; lane: Lane | null; collected: boolean }[]; bag: number[]; friends: Lane[]; melody: IslandNote[]; phrase: Lane[]; score: number; motifs: number; collected: number; skip: boolean; bloom: boolean; rested: boolean; finished: boolean; won: boolean; actions: IslandAction[]; event: string }
export const ISLANDS: readonly { id: string; name: string; mood: string; emoji: string; steps: number; unlock: number; tint: string }[]
export const FRIENDS: readonly { cell: number; lane: Lane; name: string }[]
export const SPELLS: readonly { id: string; lane: Lane; name: string; detail: string; symbol: string }[]
export const HOME: number
export function distance(a: number, b: number): number
export function routeSeed(day: string, islandId: string): number
export function validDay(day: unknown): boolean
export function todayRoute(): string
export function createJourney(islandId: string, day: string): Journey
export function canInvite(state: Journey, lane: Lane): boolean
export function reachable(state: Journey, cell: number): boolean
export function act(state: Journey, action: IslandAction): Journey | null
export function playTurn(state: Journey, action: IslandAction): Journey | null
export function replayJourney(islandId: string, day: string, actions: IslandAction[]): Journey | null
export function journeyStars(state: Journey): number
export function encodeRoute(state: Journey): string
export function decodeRoute(code: string | null): IslandAction[] | null
