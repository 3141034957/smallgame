import { SONGS, DIFFICULTIES, runStars } from './rules.mjs'
import type { MelodySong, Difficulty, RunState, Lane } from './rules.mjs'
export * from './rules.mjs'

export const BAND = [
  { id: 'cat', name: '奶糖', instrument: '小鼓手', color: '#ef9d91', key: 'D', symbol: '✿' },
  { id: 'rabbit', name: '泡芙', instrument: '键盘手', color: '#b4a0d7', key: 'F', symbol: '✦' },
  { id: 'bear', name: '布丁', instrument: '贝斯手', color: '#d5b876', key: 'J', symbol: '●' },
  { id: 'bird', name: '啾啾', instrument: '小主唱', color: '#85bca3', key: 'K', symbol: '♪' },
] as const

export type Pattern = boolean[][]
export const blankPattern = (): Pattern =>
  Array.from({ length: 4 }, () => Array<boolean>(16).fill(false))
export const PRESETS = [
  {
    name: '棉花糖',
    pattern: ['1000100010001000', '0000100000001000', '1000000010000000', '0010001000100010'],
  },
  {
    name: '摇摆果冻',
    pattern: ['1001001010010010', '0000100100001001', '1000001001000010', '0010000100100001'],
  },
  {
    name: '晚安饼干',
    pattern: ['1000000010000000', '1000100010001000', '0000100000001000', '0010001000100010'],
  },
] as const
export const presetPattern = (index: number): Pattern =>
  PRESETS[index].pattern.map((row) => [...row].map((step) => step === '1'))

export function encodePattern(pattern: Pattern): string {
  if (
    pattern.length !== 4 ||
    pattern.some((row) => row.length !== 16 || row.some((cell) => typeof cell !== 'boolean'))
  )
    throw new Error('A pattern must have four rows of sixteen steps.')
  return pattern
    .map((row) =>
      Number.parseInt(row.map((cell) => (cell ? '1' : '0')).join(''), 2)
        .toString(16)
        .padStart(4, '0'),
    )
    .join('')
}

export function decodePattern(code: string | null): Pattern | null {
  if (typeof code !== 'string' || !/^[0-9a-f]{16}$/i.test(code)) return null
  return Array.from({ length: 4 }, (_, lane) =>
    Number.parseInt(code.slice(lane * 4, lane * 4 + 4), 16)
      .toString(2)
      .padStart(16, '0')
      .split('')
      .map((step) => step === '1'),
  )
}

export type PerformanceHit = { lane: Lane; time: number; midi: number }
export type MelodyProgress = {
  records: Record<string, { score: number; stars: number }>
  offset: number
  lastMix: string | null
}
export const PROGRESS_KEY = 'mochi-melody-v1'
export const emptyProgress = (): MelodyProgress => ({ records: {}, offset: 0, lastMix: null })

export function parseProgress(raw: string | null): MelodyProgress {
  const progress = emptyProgress()
  try {
    const data = JSON.parse(raw ?? '{}')
    if (!data || typeof data !== 'object') return progress
    if (Number.isInteger(data.offset) && Math.abs(data.offset) <= 150) progress.offset = data.offset
    if (decodePattern(data.lastMix)) progress.lastMix = data.lastMix
    for (const song of SONGS)
      for (const difficulty of DIFFICULTIES) {
        const key = `${song.id}:${difficulty.id}`
        const record = data.records?.[key]
        if (
          record &&
          Number.isInteger(record.score) &&
          record.score >= 0 &&
          record.score <= 100000 &&
          Number.isInteger(record.stars) &&
          record.stars >= 0 &&
          record.stars <= 3
        )
          progress.records[key] = { score: record.score, stars: record.stars }
      }
  } catch {
    /* Keep playing when local storage is unavailable or corrupt. */
  }
  return progress
}

export const totalStars = (progress: MelodyProgress) =>
  Object.values(progress.records).reduce((sum, record) => sum + record.stars, 0)

export function saveRun(
  progress: MelodyProgress,
  song: MelodySong,
  difficulty: Difficulty,
  run: RunState,
  noteCount: number,
): MelodyProgress {
  const key = `${song.id}:${difficulty}`
  const previous = progress.records[key]
  return {
    ...progress,
    records: {
      ...progress.records,
      [key]: {
        score: Math.max(previous?.score ?? 0, run.score),
        stars: Math.max(previous?.stars ?? 0, runStars(run, noteCount)),
      },
    },
  }
}
