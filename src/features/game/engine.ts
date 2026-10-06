export type GameStatus = 'ready' | 'playing' | 'paused' | 'over' | 'reviving'
export type NoteKind = 'quarter' | 'eighth' | 'double-eighth' | 'sixteenth' | 'sharp' | 'natural'
export type TempoEffect = 'speed-up' | 'slow-down' | 'double-score' | 'freeze'

export type Platform = {
  id: number
  x: number
  width: number
  reward: 1 | 1.5
  treat?: 'star'
  note?: NoteKind
}

export type FrameState = {
  phase: number
  platformIndex: number
  playerX: number
  falling: number
  fever: number
}

export type LandingImpact = {
  id: number
  x: number
  perfect: boolean
  reward: number
}

export type NoteFeedback = {
  id: number
  kind: NoteKind
  symbol: string
  label: string
}

export const HOP_DURATION = 840
export const FEVER_DURATION = 5000
export const TEMPO_EFFECT_DURATION = 5000
export const PAINT_EFFECT_DURATION = 4000
export const DOUBLE_SCORE_DURATION = 8000
export const FREEZE_DURATION = 3000
export const VISIBLE_PLATFORMS = 6
export const PLATFORM_AREA_SCALE = 2 / 3
export const BOTTOM_HORIZONTAL_SPREAD = 0.46
export const NOTE_FREQUENCIES = [523.25, 587.33, 659.25, 783.99]

const SPEED_STEP_INTERVAL = 10
const SPEED_STEP_AMOUNT = 0.05
const MAX_PROGRESSION_SPEED = 1.7
const ROUTE_PATTERN = [
  -0.38, 0.38, -0.46, 0.46, -0.52, -0.18, 0.18, 0.52, 0.44, 0.34, -0.28, -0.48, 0, 0.56, 0, -0.56,
]
const EASY_ROUTE_PATTERN = [0, 0.28, -0.25, 0.42, -0.38, 0.55, -0.5]

export const NOTE_EFFECTS: Record<
  NoteKind,
  {
    symbol: string
    label: string
    effect: TempoEffect | 'shake' | 'paint'
  }
> = {
  quarter: { symbol: '♩', label: '加速 · 5秒', effect: 'speed-up' },
  eighth: { symbol: '♪', label: '减速 · 5秒', effect: 'slow-down' },
  'double-eighth': { symbol: '♫', label: '机械震荡 · 0.7秒', effect: 'shake' },
  sixteenth: { symbol: '♬', label: '能量墨迹 · 4秒', effect: 'paint' },
  sharp: { symbol: '♯', label: '狂热旋律 · 8秒', effect: 'double-score' },
  natural: { symbol: '♮', label: '冰霜凝滞 · 3秒', effect: 'freeze' },
}

const NOTE_KINDS = Object.keys(NOTE_EFFECTS) as NoteKind[]

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function createPlatforms(random = Math.random): Platform[] {
  const items: Platform[] = [
    {
      id: 0,
      x: 0,
      width: 0.92,
      reward: 1,
    },
  ]
  let previousX = 0

  for (let id = 1; id < 80; id += 1) {
    const platform = createPlatform(id, previousX, random)
    items.push(platform)
    previousX = platform.x
  }

  return items
}

export function ensurePlatformsThrough(
  platforms: Platform[],
  targetId: number,
  random = Math.random,
) {
  let latestPlatform = platforms[platforms.length - 1]
  while (latestPlatform.id < targetId) {
    latestPlatform = createPlatform(latestPlatform.id + 1, latestPlatform.x, random)
    platforms.push(latestPlatform)
  }
}

export function createPlatform(id: number, previousX: number, random = Math.random): Platform {
  const easyStart = id <= 6
  const hasStar = id % 6 === 0
  const x = easyStart
    ? EASY_ROUTE_PATTERN[id]
    : (() => {
        const patternIndex = (id - 7) % ROUTE_PATTERN.length
        const phrase = Math.floor((id - 7) / ROUTE_PATTERN.length)
        const phraseDrift = Math.sin(phrase * 1.31) * 0.045
        const plannedX = ROUTE_PATTERN[patternIndex] * 1.8 + phraseDrift
        return clamp(plannedX * 0.95 + previousX * 0.05, -0.87, 0.87)
      })()
  const reward = !hasStar && random() < 1 / 15 ? 1.5 : 1

  return {
    id,
    x,
    width: easyStart ? 0.88 : 0.66 + ((id * 17) % 21) / 100,
    reward,
    treat: hasStar ? 'star' : undefined,
    note:
      !hasStar && reward === 1 && random() < 0.1
        ? NOTE_KINDS[Math.floor(random() * NOTE_KINDS.length)]
        : undefined,
  }
}

export function slotY(distance: number) {
  if (distance >= 0) return 20 + 64 * Math.exp(-0.42 * distance)
  return 84 + Math.abs(distance) * 30
}

export function slotScale(distance: number) {
  return 0.34 + 0.66 * Math.exp(-0.27 * Math.max(0, distance))
}

export function slotHorizontalSpread(scale: number) {
  return scale * (0.3 + 0.16 * scale)
}

export function progressionSpeed(platformIndex: number) {
  const speedSteps = Math.floor(platformIndex / SPEED_STEP_INTERVAL)
  return Math.min(MAX_PROGRESSION_SPEED, 1 + speedSteps * SPEED_STEP_AMOUNT)
}

export function formatScore(score: number) {
  return String(score).padStart(5, '0')
}
