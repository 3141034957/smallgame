import { SEEDS, SLOT_COUNT, emptyBoard, encodeBoard, evaluateChapter } from './engine'
import type { Board, SeedKind } from './engine'

export type GardenBonus = { label: string; points: number }
export type GardenScore = { score: number; bonuses: GardenBonus[] }
export type DailyPattern = { featuredSlot: number; featuredKind: SeedKind; quietSlot: number }

export const DAILY_ROUNDS = 6

const KINDS: readonly SeedKind[] = ['heart', 'rain', 'bell', 'echo']
const SEED_POINTS = 10

function dayNumberFromKey(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError('Date key must be a real date in YYYY-MM-DD format.')
  }
  const timestamp = Date.parse(`${dateKey}T00:00:00Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== dateKey) {
    throw new RangeError('Date key must be a real date in YYYY-MM-DD format.')
  }
  return Math.floor(timestamp / 86_400_000)
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function hashDate(dateKey: string): number {
  let hash = 2_166_136_261
  for (const character of dateKey) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  }
  return hash >>> 0
}

/** Three distinct choices. The omitted kind rotates each round, so every day offers all four. */
export function getDailyOffers(dateKey: string, roundIndex: number): readonly SeedKind[] {
  const dayNumber = dayNumberFromKey(dateKey)
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= DAILY_ROUNDS) {
    throw new RangeError('Daily round must be an integer from 0 to 5.')
  }

  const omitted = positiveModulo(dayNumber + roundIndex, KINDS.length)
  const offers = KINDS.filter((_, index) => index !== omitted)
  let state = (hashDate(dateKey) ^ Math.imul(roundIndex + 1, 0x9e3779b9)) >>> 0
  for (let index = offers.length - 1; index > 0; index -= 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    const swapIndex = (state >>> 0) % (index + 1)
    const swapped = offers[index]
    offers[index] = offers[swapIndex]
    offers[swapIndex] = swapped
  }
  return Object.freeze(offers)
}

/** Date-only challenge targets. All three parts move between neighboring days. */
export function getDailyPattern(dateKey: string): DailyPattern {
  const dayNumber = dayNumberFromKey(dateKey)
  const featuredSlot = positiveModulo(dayNumber * 3 + Math.floor(dayNumber / SLOT_COUNT), SLOT_COUNT)
  const featuredKind = KINDS[positiveModulo(dayNumber + Math.floor(dayNumber / KINDS.length), KINDS.length)]
  const quietOffset = 1 + positiveModulo(dayNumber, SLOT_COUNT - 1)
  const quietSlot = positiveModulo(featuredSlot + quietOffset, SLOT_COUNT)
  return { featuredSlot, featuredKind, quietSlot }
}

/** A seed is worth 10 points; each named pattern is awarded once per garden. */
export function scoreGarden(board: Board): GardenScore {
  encodeBoard(board) // Validate the runtime board as well as its TypeScript shape.
  const planted = board.filter((kind) => kind !== null)
  const bonuses: GardenBonus[] = []

  if (evaluateChapter(board, 0).complete) {
    bonuses.push({ label: '对置心跳', points: 30 })
  }
  if (evaluateChapter(board, 1).complete) {
    bonuses.push({ label: '双岸雨声', points: 25 })
  }
  if (evaluateChapter(board, 2).complete) {
    bonuses.push({ label: '铃后回声', points: 25 })
  }
  if (new Set(planted).size === KINDS.length) {
    bonuses.push({ label: '四声齐鸣', points: 20 })
  }

  let variedNeighbors = 0
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const current = board[index]
    const next = board[(index + 1) % SLOT_COUNT]
    if (current !== null && next !== null && current !== next) variedNeighbors += 1
  }
  const rewardedNeighbors = Math.min(variedNeighbors, 3)
  if (rewardedNeighbors > 0) {
    bonuses.push({ label: `错落相邻 ×${rewardedNeighbors}`, points: rewardedNeighbors * 4 })
  }

  return {
    score: planted.length * SEED_POINTS + bonuses.reduce((total, bonus) => total + bonus.points, 0),
    bonuses,
  }
}

/** Which of the three beats of the other half circle carry rain. */
const RAIN_LAYOUTS: readonly number[][] = [[0], [1], [2], [0, 1], [0, 2], [1, 2]]

/**
 * The song the moon plays tonight: a full board that answers all four letters,
 * laid out from the date so every player hears the same one on the same night.
 */
export function getNightlyPick(dateKey: string): Board {
  const dayNumber = dayNumberFromKey(dateKey)
  const state = hashDate(dateKey)
  const heartOffset = positiveModulo(dayNumber + (state >>> 3), SLOT_COUNT / 2)
  const bellHalf = positiveModulo(dayNumber + (state >>> 7), 2)
  const rainLayout = RAIN_LAYOUTS[positiveModulo(dayNumber + (state >>> 11), RAIN_LAYOUTS.length)]

  const board = emptyBoard()
  board[heartOffset] = 'heart'
  board[heartOffset + SLOT_COUNT / 2] = 'heart'

  const halves = [
    [1, 2, 3].map((offset) => (heartOffset + offset) % SLOT_COUNT),
    [5, 6, 7].map((offset) => (heartOffset + offset) % SLOT_COUNT),
  ]
  // The half circle holding the bell is walked as rain, bell, echo so the
  // clockwise order of first-heard sounds stays heart → rain → bell → echo.
  const bellSlots = halves[bellHalf]
  board[bellSlots[0]] = 'rain'
  board[bellSlots[1]] = 'bell'
  board[bellSlots[2]] = 'echo'
  for (const offset of rainLayout) board[halves[1 - bellHalf][offset]] = 'rain'

  return board
}

/** Milliseconds until the Beijing date rolls over, for "tomorrow's new puzzle". */
export function msUntilNextDaily(now = Date.now()): number {
  const beijingNow = now + 8 * 60 * 60 * 1000
  return Math.ceil(beijingNow / 86_400_000) * 86_400_000 - beijingNow
}

export type GardenHint = {
  index: number
  kind: SeedKind | null
  score: number
  gain: number
}

/**
 * The single beat change worth the most points. Empty slots may take any of the
 * offered seeds; planted slots may take another seed or be cleared again.
 */
export function suggestNextMove(
  board: Board,
  options: { kinds?: readonly SeedKind[]; score?: (candidate: Board) => GardenScore } = {},
): GardenHint | null {
  const kinds = options.kinds ?? KINDS
  const score = options.score ?? scoreGarden
  const current = score(board).score
  let best: GardenHint | null = null

  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const planted = board[index]
    const attempts: (SeedKind | null)[] = planted === null
      ? [...kinds]
      : [...kinds.filter((kind) => kind !== planted), null]
    for (const kind of attempts) {
      const candidate = [...board]
      candidate[index] = kind
      const gain = score(candidate).score - current
      if (gain <= 0) continue
      if (!best || gain > best.gain) best = { index, kind, score: current + gain, gain }
    }
  }

  return best
}

/** A day's postmark and quiet beat add goals without changing the base composition rules. */
export function scoreDailyGarden(board: Board, dateKey: string): GardenScore {
  const base = scoreGarden(board)
  const { featuredSlot, featuredKind, quietSlot } = getDailyPattern(dateKey)
  const bonuses = [...base.bonuses]

  if (board[featuredSlot] === featuredKind) {
    const seedName = SEEDS.find((seed) => seed.kind === featuredKind)!.name
    bonuses.push({ label: `今日邮戳 · 第 ${featuredSlot + 1} 拍${seedName}`, points: 25 })
  }
  if (board.filter((kind) => kind !== null).length === DAILY_ROUNDS && board[quietSlot] === null) {
    bonuses.push({ label: `今日留白 · 第 ${quietSlot + 1} 拍`, points: 15 })
  }

  return { score: base.score + bonuses.slice(base.bonuses.length).reduce((total, bonus) => total + bonus.points, 0), bonuses }
}
