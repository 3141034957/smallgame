import { describe, expect, it } from 'vitest'
import {
  BPM,
  CHAPTERS,
  SEEDS,
  SLOT_COUNT,
  STEP_SECONDS,
  decodeBoard,
  emptyBoard,
  encodeBoard,
  evaluateChapter,
  evaluateStoryChapter,
  plantSeed,
} from './engine'
import type { Board, SeedKind } from './engine'

function boardWith(...slots: [number, SeedKind][]): Board {
  return slots.reduce((board, [index, kind]) => plantSeed(board, index, kind), emptyBoard())
}

describe('echo greenhouse board', () => {
  it('defines eight steps and four progressively unlocked letters', () => {
    expect(SLOT_COUNT).toBe(8)
    expect(STEP_SECONDS).toBe(60 / BPM)
    expect(SEEDS.map((seed) => seed.kind)).toEqual(['heart', 'rain', 'bell', 'echo'])
    expect(CHAPTERS).toHaveLength(4)
    expect(CHAPTERS.map((chapter) => chapter.allowed)).toEqual([
      ['heart'],
      ['heart', 'rain'],
      ['heart', 'rain', 'bell', 'echo'],
      ['heart', 'rain', 'bell', 'echo'],
    ])
  })

  it('plants, replaces, and toggles a seed without mutating its input', () => {
    const original = emptyBoard()
    const heart = plantSeed(original, 7, 'heart')
    const rain = plantSeed(heart, 7, 'rain')

    expect(original).toEqual(Array(8).fill(null))
    expect(heart[7]).toBe('heart')
    expect(rain[7]).toBe('rain')
    expect(plantSeed(rain, 7, 'rain')[7]).toBeNull()
    expect(emptyBoard()).not.toBe(original)
  })

  it('rejects invalid slot numbers and malformed boards', () => {
    expect(() => plantSeed(emptyBoard(), -1, 'heart')).toThrow(RangeError)
    expect(() => plantSeed(emptyBoard(), 8, 'heart')).toThrow(RangeError)
    expect(() => plantSeed(emptyBoard(), 1.5, 'heart')).toThrow(RangeError)
    expect(() => plantSeed([], 0, 'heart')).toThrow()
    expect(() => evaluateChapter(emptyBoard(), 4)).toThrow(RangeError)
  })
})

describe('letter patterns', () => {
  it('requires opposite hearts, including across the end of the array', () => {
    expect(evaluateChapter(boardWith([3, 'heart'], [7, 'heart']), 0)).toMatchObject({
      complete: true,
      marked: [3, 7],
    })
    expect(evaluateChapter(boardWith([3, 'heart'], [6, 'heart']), 0).complete).toBe(false)
    expect(evaluateChapter(boardWith([3, 'heart']), 0).marked).toEqual([])
  })

  it('requires rain in each of the two half circles between the heart pair', () => {
    expect(evaluateChapter(boardWith([0, 'heart'], [4, 'heart'], [2, 'rain'], [6, 'rain']), 1)).toMatchObject({
      complete: true,
      marked: [0, 2, 4, 6],
    })
    expect(evaluateChapter(boardWith([0, 'heart'], [4, 'heart'], [1, 'rain'], [3, 'rain']), 1).complete).toBe(false)
    expect(evaluateChapter(boardWith([1, 'rain'], [5, 'rain']), 1).complete).toBe(false)
  })

  it('finds a valid heart pair when another pair is not surrounded by rain', () => {
    const board = boardWith(
      [0, 'heart'], [4, 'heart'], [2, 'heart'], [6, 'heart'],
      [1, 'rain'], [3, 'rain'],
    )
    expect(evaluateChapter(board, 1)).toMatchObject({ complete: true, marked: [1, 2, 3, 6] })
  })

  it('requires echo immediately clockwise after bell, including 7 to 0', () => {
    expect(evaluateChapter(boardWith([7, 'bell'], [0, 'echo']), 2)).toMatchObject({
      complete: true,
      marked: [0, 7],
    })
    expect(evaluateChapter(boardWith([0, 'bell'], [7, 'echo']), 2).complete).toBe(false)
    expect(evaluateChapter(boardWith([2, 'bell'], [4, 'echo']), 2).complete).toBe(false)
  })

  it('asks for the four sounds to appear clockwise as heart, rain, bell, echo', () => {
    const ordered = boardWith(
      [0, 'heart'], [1, 'rain'], [2, 'bell'], [3, 'echo'], [4, 'heart'], [6, 'rain'],
    )
    expect(evaluateChapter(ordered, 3)).toMatchObject({ complete: true, marked: [0, 1, 2, 3] })

    const wrapped = boardWith([6, 'heart'], [7, 'rain'], [0, 'bell'], [1, 'echo'])
    expect(evaluateChapter(wrapped, 3)).toMatchObject({ complete: true, marked: [6, 7, 0, 1] })

    const scattered = boardWith([0, 'heart'], [4, 'heart'], [2, 'rain'], [6, 'rain'], [1, 'bell'], [7, 'echo'])
    expect(evaluateChapter(scattered, 3).complete).toBe(false)

    const swapped = boardWith([0, 'heart'], [2, 'bell'], [3, 'rain'], [4, 'echo'])
    expect(evaluateChapter(swapped, 3).complete).toBe(false)
    expect(evaluateChapter(emptyBoard(), 3).complete).toBe(false)
  })
})

describe('cumulative story letters', () => {
  it('keeps the first letter evaluation unchanged', () => {
    const board = boardWith([0, 'heart'], [4, 'heart'])
    expect(evaluateStoryChapter(board, 0)).toEqual(evaluateChapter(board, 0))
  })

  it('explains which earlier letter must be restored before delivery', () => {
    const missingHeart = boardWith([1, 'rain'], [5, 'rain'], [2, 'bell'], [3, 'echo'])
    expect(evaluateChapter(missingHeart, 2).complete).toBe(true)
    expect(evaluateStoryChapter(missingHeart, 2)).toMatchObject({
      complete: false,
      message: expect.stringContaining('心跳'),
      marked: [],
    })

    const missingRain = boardWith([0, 'heart'], [4, 'heart'], [6, 'rain'], [2, 'bell'], [3, 'echo'])
    expect(evaluateChapter(missingRain, 2).complete).toBe(true)
    expect(evaluateStoryChapter(missingRain, 2)).toMatchObject({
      complete: false,
      message: expect.stringContaining('雨声'),
      marked: [],
    })
  })

  it('lets an alternating second-letter layout be rearranged into a valid finale', () => {
    const alternating = boardWith([0, 'heart'], [2, 'rain'], [4, 'heart'], [6, 'rain'])
    expect(evaluateStoryChapter(alternating, 1).complete).toBe(true)
    expect(alternating.every((kind, index) => kind !== null || alternating[(index + 1) % SLOT_COUNT] !== null)).toBe(true)

    const movedRain = plantSeed(plantSeed(alternating, 2, 'rain'), 1, 'rain')
    const finale = plantSeed(plantSeed(movedRain, 2, 'bell'), 3, 'echo')
    expect(evaluateStoryChapter(finale, 2)).toMatchObject({ complete: true, marked: [2, 3] })
    expect(evaluateChapter(finale, 0).complete).toBe(true)
    expect(evaluateChapter(finale, 1).complete).toBe(true)
  })

  it('delivers the last letter only once the whole ring is in order', () => {
    const ring = boardWith(
      [0, 'heart'], [1, 'rain'], [2, 'bell'], [3, 'echo'], [4, 'heart'], [5, 'rain'],
    )
    for (let chapter = 0; chapter < 4; chapter += 1) {
      expect(evaluateStoryChapter(ring, chapter).complete).toBe(true)
    }

    const crossed = boardWith(
      [0, 'heart'], [1, 'bell'], [2, 'echo'], [3, 'rain'], [4, 'heart'], [5, 'bell'], [6, 'echo'], [7, 'rain'],
    )
    expect(evaluateStoryChapter(crossed, 2).complete).toBe(true)
    expect(evaluateStoryChapter(crossed, 3)).toMatchObject({ complete: false, marked: [] })
  })

  it('preserves invalid-input handling for the cumulative evaluator', () => {
    expect(() => evaluateStoryChapter([], 1)).toThrow()
    expect(() => evaluateStoryChapter(emptyBoard(), 4)).toThrow(RangeError)
  })
})

describe('board sharing code', () => {
  it('round trips all seed kinds and empty slots in their exact positions', () => {
    const board = boardWith([0, 'heart'], [2, 'rain'], [4, 'bell'], [7, 'echo'])
    expect(encodeBoard(board)).toBe('H.R.B..E')
    expect(decodeBoard('H.R.B..E')).toEqual(board)
    expect(encodeBoard(emptyBoard())).toBe('........')
  })

  it('rejects codes with the wrong length, case, or characters', () => {
    expect(decodeBoard('H.R.B.E')).toBeNull()
    expect(decodeBoard('H.R.B..EE')).toBeNull()
    expect(decodeBoard('h.R.B..E')).toBeNull()
    expect(decodeBoard('H.R.X..E')).toBeNull()
    expect(decodeBoard('H.R.B.. ')).toBeNull()
    expect(() => encodeBoard(['heart'] as Board)).toThrow()
    expect(() => encodeBoard(['oops', ...emptyBoard().slice(1)] as Board)).toThrow()
  })
})
