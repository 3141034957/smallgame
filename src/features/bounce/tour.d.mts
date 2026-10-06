import type { Aim, BounceRound, GardenNode, ShotResult } from './rules.mjs'
import type { Lane } from '../melody/engine'
export type Character = 'rabbit' | 'cat' | 'bear' | 'bird'
export type TourAim = Aim & { character: Character }
export type TourRound = BounceRound & {
  mode: 'tour'
  portals: number
  skills: number
  voices: number[]
  title: string
}
export const CAST: {
  id: Character
  lane: Lane
  name: string
  skill: string
  detail: string
  symbol: string
}[]
export const ACTS: {
  id: string
  name: string
  short: string
  emoji: string
  hint: string
  color: string
}[]
export function validTourAim(aim: unknown): aim is TourAim
export function simulateTourShot(
  day: string,
  index: number,
  aim: TourAim,
  includePath?: boolean,
): ShotResult | null
export function replayTour(day: string, shots: TourAim[]): TourRound | null
export function encodeShow(shots: TourAim[]): string
export function decodeShow(value: unknown): TourAim[] | null
export function tourGarden(day: string, index: number): GardenNode[]
