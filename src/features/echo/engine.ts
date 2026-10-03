export type SeedKind = 'heart' | 'rain' | 'bell' | 'echo'
export type Board = (SeedKind | null)[]

export type Seed = {
  kind: SeedKind
  name: string
  icon: string
  description: string
  color: string
}

export type Chapter = {
  title: string
  from: string
  request: string
  hint: string
  reply: string
  allowed: readonly SeedKind[]
}

export type ChapterEvaluation = {
  complete: boolean
  message: string
  marked: number[]
}

export const SLOT_COUNT = 8
export const BPM = 112
export const STEP_SECONDS = 60 / BPM

export const SEEDS: readonly Seed[] = [
  { kind: 'heart', name: '心跳', icon: '♥', description: '给花房一颗稳定的心', color: '#f18b83' },
  { kind: 'rain', name: '雨声', icon: '☂', description: '让细雨落在节拍之间', color: '#78bde4' },
  { kind: 'bell', name: '铃声', icon: '✦', description: '在空气里点亮一颗音', color: '#edc26d' },
  { kind: 'echo', name: '回声', icon: '◎', description: '接住上一格留下的声音', color: '#ae96dd' },
]

export const CHAPTERS: readonly Chapter[] = [
  {
    title: '第一封信 · 心跳',
    from: '寄自一间安静的花房',
    request: '花房太安静了。请给我两次心跳，让它们隔着半圈相望。',
    hint: '在八个格子里放两颗心跳，它们相隔四格。',
    reply: '收到了。沉睡的花房，第一次有了心跳。',
    allowed: ['heart'],
  },
  {
    title: '第二封信 · 雨声',
    from: '寄自窗边的一朵云',
    request: '我想让雨落在两次心跳之间。绕着花房走，两段路都要听见雨。',
    hint: '两颗相隔四格的心跳之间，有两个半圈；每个半圈至少放一颗雨声。',
    reply: '雨落下来了。花房开始跟着心跳呼吸。',
    allowed: ['heart', 'rain'],
  },
  {
    title: '第三封信 · 回声',
    from: '寄自一只记得旋律的铃',
    request: '铃响以后，愿下一步就有人回应。请把我的声音还给我。',
    hint: '放一颗铃声，再把回声放在它顺时针紧接的下一格。',
    reply: '铃声有了回音，花房记住了你的旋律。',
    allowed: ['heart', 'rain', 'bell', 'echo'],
  },
  {
    title: '第四封信 · 绕行',
    from: '寄自转了整整一夜的唱针',
    request: '最后一件小事：让唱针顺时针走完一圈，依次听见心跳、雨声、铃声，再由回声收尾。',
    hint: '顺时针方向上，先遇到心跳，再遇到雨声，然后是铃声，最后才是回声；中间可以隔着空位。',
    reply: '一整圈听下来，四种声音排成了你要的顺序。这首歌可以寄出去了。',
    allowed: ['heart', 'rain', 'bell', 'echo'],
  },
]

/** The clockwise running order the last letter asks for. */
const CLOCKWISE_ORDER: readonly SeedKind[] = ['heart', 'rain', 'bell', 'echo']

const SEED_CODES: Record<SeedKind, string> = {
  heart: 'H',
  rain: 'R',
  bell: 'B',
  echo: 'E',
}

const CODE_SEEDS: Record<string, SeedKind> = {
  H: 'heart',
  R: 'rain',
  B: 'bell',
  E: 'echo',
}

function assertBoard(board: Board): void {
  if (!Array.isArray(board) || board.length !== SLOT_COUNT) {
    throw new Error('Board must contain exactly eight valid seed slots.')
  }
  for (const seed of board) {
    if (seed !== null && seed !== 'heart' && seed !== 'rain' && seed !== 'bell' && seed !== 'echo') {
      throw new Error('Board must contain exactly eight valid seed slots.')
    }
  }
}

export function emptyBoard(): Board {
  return Array<SeedKind | null>(SLOT_COUNT).fill(null)
}

export function plantSeed(board: Board, index: number, kind: SeedKind): Board {
  assertBoard(board)
  if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) {
    throw new RangeError('Seed slot must be an integer from 0 to 7.')
  }
  if (kind !== 'heart' && kind !== 'rain' && kind !== 'bell' && kind !== 'echo') {
    throw new Error('Unknown seed kind.')
  }

  const next = [...board]
  next[index] = board[index] === kind ? null : kind
  return next
}

function heartPairs(board: Board): [number, number][] {
  const pairs: [number, number][] = []
  for (let index = 0; index < SLOT_COUNT / 2; index += 1) {
    if (board[index] === 'heart' && board[index + SLOT_COUNT / 2] === 'heart') {
      pairs.push([index, index + SLOT_COUNT / 2])
    }
  }
  return pairs
}

function findRain(board: Board, start: number): number | undefined {
  for (let offset = 1; offset < SLOT_COUNT / 2; offset += 1) {
    const index = (start + offset) % SLOT_COUNT
    if (board[index] === 'rain') return index
  }
  return undefined
}

/** Walks a whole circle from every beat, asking which four sounds are heard first. */
function clockwiseRoundDance(board: Board): number[] | null {
  for (let start = 0; start < SLOT_COUNT; start += 1) {
    const heard: SeedKind[] = []
    const marked: number[] = []
    for (let offset = 0; offset < SLOT_COUNT; offset += 1) {
      const index = (start + offset) % SLOT_COUNT
      const kind = board[index]
      if (!kind || heard.includes(kind)) continue
      heard.push(kind)
      marked.push(index)
      if (heard.length === CLOCKWISE_ORDER.length) break
    }
    if (
      heard.length === CLOCKWISE_ORDER.length &&
      heard.every((kind, index) => kind === CLOCKWISE_ORDER[index])
    ) {
      return marked
    }
  }
  return null
}

export function evaluateChapter(board: Board, chapterIndex: number): ChapterEvaluation {
  assertBoard(board)
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= CHAPTERS.length) {
    throw new RangeError('Unknown chapter index.')
  }

  if (chapterIndex === 0) {
    const pair = heartPairs(board)[0]
    return pair
      ? { complete: true, message: '花房听见了第一声心跳。', marked: pair }
      : { complete: false, message: '还需要两颗相隔四格的心跳。', marked: [] }
  }

  if (chapterIndex === 1) {
    const pairs = heartPairs(board)
    if (pairs.length === 0) {
      return { complete: false, message: '先让两颗心跳隔着半圈相望。', marked: [] }
    }
    for (const [firstHeart, secondHeart] of pairs) {
      const firstRain = findRain(board, firstHeart)
      const secondRain = findRain(board, secondHeart)
      if (firstRain !== undefined && secondRain !== undefined) {
        return {
          complete: true,
          message: '雨落在了心跳之间，花房有了呼吸。',
          marked: [firstHeart, secondHeart, firstRain, secondRain].sort((a, b) => a - b),
        }
      }
    }
    return { complete: false, message: '两段路上都需要一颗雨声。', marked: [] }
  }

  if (chapterIndex === 2) {
    for (let index = 0; index < SLOT_COUNT; index += 1) {
      const nextIndex = (index + 1) % SLOT_COUNT
      if (board[index] === 'bell' && board[nextIndex] === 'echo') {
        return {
          complete: true,
          message: '铃声有了回音，花房记住了这首歌。',
          marked: [index, nextIndex].sort((a, b) => a - b),
        }
      }
    }
    return { complete: false, message: '让回声紧跟在铃声的顺时针下一格。', marked: [] }
  }

  const dance = clockwiseRoundDance(board)
  return dance
    ? { complete: true, message: '心跳、雨声、铃声、回声，绕着花房排成了一圈。', marked: dance }
    : { complete: false, message: '顺时针走一圈，要依次遇到心跳、雨声、铃声、回声。', marked: [] }
}

const RESTORE_MESSAGES: readonly string[] = [
  '先找回第一封信的心跳：让两颗心跳相隔四格。',
  '先找回第二封信的雨声：两段半圈都需要一颗雨声。',
  '先找回第三封信的回声：让回声紧跟在铃声的顺时针下一格。',
]

/** A later letter must not be delivered by erasing the music of an earlier one. */
export function evaluateStoryChapter(board: Board, chapterIndex: number): ChapterEvaluation {
  // Evaluate the requested chapter first so malformed boards and indices retain
  // the same validation contract as evaluateChapter.
  const current = evaluateChapter(board, chapterIndex)

  for (let previous = 0; previous < chapterIndex; previous += 1) {
    if (!evaluateChapter(board, previous).complete) {
      return {
        complete: false,
        message: RESTORE_MESSAGES[previous],
        marked: [],
      }
    }
  }

  return current
}

export function encodeBoard(board: Board): string {
  assertBoard(board)
  return board.map((seed) => seed === null ? '.' : SEED_CODES[seed]).join('')
}

export function decodeBoard(code: string): Board | null {
  if (typeof code !== 'string' || !/^[HRBE.]{8}$/.test(code)) return null
  return [...code].map((character) => character === '.' ? null : CODE_SEEDS[character])
}
