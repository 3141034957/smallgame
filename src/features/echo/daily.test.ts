import { describe, expect, it } from 'vitest'
import { emptyBoard, plantSeed } from './engine'
import type { Board, SeedKind } from './engine'
import {
  DAILY_ROUNDS,
  bestDailyScore,
  getDailyOffers,
  getDailyPattern,
  getNightlyPick,
  msUntilNextDaily,
  scoreDailyGarden,
  scoreGarden,
  suggestNextMove,
} from './daily'
import { CHAPTERS, evaluateStoryChapter, encodeBoard } from './engine'

function boardWith(...slots: [number, SeedKind][]): Board {
  return slots.reduce((board, [index, kind]) => plantSeed(board, index, kind), emptyBoard())
}

describe('daily offers', () => {
  it('offers three distinct seeds per round and shows all four over six rounds', () => {
    const rounds = Array.from({ length: DAILY_ROUNDS }, (_, index) =>
      getDailyOffers('2026-09-24', index),
    )
    expect(DAILY_ROUNDS).toBe(6)
    expect(rounds.every((offers) => offers.length === 3 && new Set(offers).size === 3)).toBe(true)
    expect(new Set(rounds.flat())).toEqual(new Set(['heart', 'rain', 'bell', 'echo']))
  })

  it('is stable for the same date and changes between adjacent dates', () => {
    const firstDay = Array.from({ length: DAILY_ROUNDS }, (_, index) =>
      getDailyOffers('2026-09-24', index),
    )
    const firstDayAgain = Array.from({ length: DAILY_ROUNDS }, (_, index) =>
      getDailyOffers('2026-09-24', index),
    )
    const nextDay = Array.from({ length: DAILY_ROUNDS }, (_, index) =>
      getDailyOffers('2026-09-25', index),
    )
    expect(firstDayAgain).toEqual(firstDay)
    expect(nextDay).not.toEqual(firstDay)
  })

  it('rejects impossible dates and out-of-range rounds', () => {
    expect(() => getDailyOffers('2026-02-29', 0)).toThrow(RangeError)
    expect(() => getDailyOffers('2026-9-24', 0)).toThrow(RangeError)
    expect(() => getDailyOffers('2026-09-24', -1)).toThrow(RangeError)
    expect(() => getDailyOffers('2026-09-24', 6)).toThrow(RangeError)
    expect(() => getDailyOffers('2026-09-24', 1.5)).toThrow(RangeError)
  })
})

describe('daily pattern', () => {
  it('is stable for a date, keeps its two slots distinct, and changes each target on adjacent days', () => {
    let previous = getDailyPattern('2026-09-24')
    expect(getDailyPattern('2026-09-24')).toEqual(previous)
    for (let offset = 1; offset < 120; offset += 1) {
      const date = new Date(Date.UTC(2026, 8, 24 + offset)).toISOString().slice(0, 10)
      const current = getDailyPattern(date)
      expect(current.featuredSlot).toBeGreaterThanOrEqual(0)
      expect(current.featuredSlot).toBeLessThan(8)
      expect(current.quietSlot).toBeGreaterThanOrEqual(0)
      expect(current.quietSlot).toBeLessThan(8)
      expect(current.quietSlot).not.toBe(current.featuredSlot)
      expect(current.featuredSlot).not.toBe(previous.featuredSlot)
      expect(current.featuredKind).not.toBe(previous.featuredKind)
      expect(current.quietSlot).not.toBe(previous.quietSlot)
      previous = current
    }
  })

  it('rejects impossible dates', () => {
    expect(() => getDailyPattern('2026-02-29')).toThrow(RangeError)
    expect(() => getDailyPattern('2026-9-24')).toThrow(RangeError)
  })
})

describe('daily score', () => {
  const date = '2026-09-24'

  it('awards a postmark for the specified seed in the specified beat', () => {
    const { featuredSlot, featuredKind } = getDailyPattern(date)
    const board = boardWith([featuredSlot, featuredKind])
    const base = scoreGarden(board)
    const result = scoreDailyGarden(board, date)
    expect(result.score).toBe(base.score + 25)
    expect(result.bonuses).toContainEqual({
      label: expect.stringContaining(`第 ${featuredSlot + 1} 拍`),
      points: 25,
    })
    expect(result.bonuses.find((bonus) => bonus.label.startsWith('今日邮戳'))?.label).toContain(
      { heart: '心跳', rain: '雨声', bell: '铃声', echo: '回声' }[featuredKind],
    )
    expect(scoreGarden(board)).toEqual(base)
  })

  it('awards the quiet beat only after all six seeds are planted', () => {
    const { featuredSlot, featuredKind, quietSlot } = getDailyPattern(date)
    const slots = [
      featuredSlot,
      ...Array.from({ length: 8 }, (_, index) => index).filter(
        (index) => index !== featuredSlot && index !== quietSlot,
      ),
    ].slice(0, DAILY_ROUNDS)
    const complete = emptyBoard()
    for (const slot of slots) complete[slot] = slot === featuredSlot ? featuredKind : 'heart'
    const partial = [...complete]
    partial[slots[1]] = null

    expect(
      scoreDailyGarden(partial, date).bonuses.some((bonus) => bonus.label.startsWith('今日留白')),
    ).toBe(false)
    const scored = scoreDailyGarden(complete, date)
    expect(scored.score).toBe(scoreGarden(complete).score + 40)
    expect(scored.bonuses).toContainEqual({
      label: `今日留白 · 第 ${quietSlot + 1} 拍`,
      points: 15,
    })
  })

  it('does not award the quiet beat when its specified slot is occupied', () => {
    const { quietSlot } = getDailyPattern(date)
    const slots = [
      quietSlot,
      ...Array.from({ length: 8 }, (_, index) => index).filter((index) => index !== quietSlot),
    ].slice(0, DAILY_ROUNDS)
    const board = boardWith(...slots.map((slot): [number, SeedKind] => [slot, 'heart']))
    expect(
      scoreDailyGarden(board, date).bonuses.some((bonus) => bonus.label.startsWith('今日留白')),
    ).toBe(false)
  })
})

describe('garden score', () => {
  it('awards 10 points per seed and no bonuses for an empty or repetitive layout', () => {
    expect(scoreGarden(emptyBoard())).toEqual({ score: 0, bonuses: [] })
    expect(scoreGarden(boardWith([0, 'heart'], [1, 'heart']))).toEqual({ score: 20, bonuses: [] })
  })

  it('awards each named composition bonus once for a six-seed complete song', () => {
    const garden = boardWith(
      [0, 'heart'],
      [1, 'rain'],
      [2, 'bell'],
      [3, 'echo'],
      [4, 'heart'],
      [5, 'rain'],
    )
    expect(scoreGarden(garden)).toEqual({
      score: 172,
      bonuses: [
        { label: '对置心跳', points: 30 },
        { label: '双岸雨声', points: 25 },
        { label: '铃后回声', points: 25 },
        { label: '四声齐鸣', points: 20 },
        { label: '错落相邻 ×3', points: 12 },
      ],
    })
  })

  it('does not grant rain or echo bonuses for misplaced seeds', () => {
    const garden = boardWith(
      [0, 'heart'],
      [1, 'rain'],
      [2, 'bell'],
      [3, 'rain'],
      [4, 'heart'],
      [7, 'echo'],
    )
    const labels = scoreGarden(garden).bonuses.map(({ label }) => label)
    expect(labels).toContain('对置心跳')
    expect(labels).toContain('四声齐鸣')
    expect(labels).not.toContain('双岸雨声')
    expect(labels).not.toContain('铃后回声')
    expect(scoreGarden(garden).score).toBeLessThan(172)
  })

  it('counts clockwise adjacency across the 7-to-0 boundary', () => {
    expect(scoreGarden(boardWith([7, 'bell'], [0, 'echo']))).toEqual({
      score: 49,
      bonuses: [
        { label: '铃后回声', points: 25 },
        { label: '错落相邻 ×1', points: 4 },
      ],
    })
  })

  it('rejects malformed boards instead of scoring them', () => {
    expect(() => scoreGarden([])).toThrow()
    expect(() => scoreGarden(['invalid', ...emptyBoard().slice(1)] as Board)).toThrow()
  })
})

describe('nightly pick', () => {
  it('answers all four letters on every night of a long stretch', () => {
    const seen = new Set<string>()
    for (let offset = 0; offset < 240; offset += 1) {
      const date = new Date(Date.UTC(2026, 8, 1 + offset)).toISOString().slice(0, 10)
      const board = getNightlyPick(date)
      seen.add(encodeBoard(board))
      expect(board.filter(Boolean).length).toBeGreaterThanOrEqual(6)
      for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
        expect(evaluateStoryChapter(board, chapter).complete).toBe(true)
      }
      expect(scoreGarden(board).score).toBeGreaterThanOrEqual(
        scoreGarden(getNightlyPick('2026-09-01')).score - 40,
      )
    }
    expect(seen.size).toBeGreaterThan(12)
  })

  it('is stable for a date and scores well', () => {
    const board = getNightlyPick('2026-09-24')
    expect(getNightlyPick('2026-09-24')).toEqual(board)
    expect(getNightlyPick('2026-09-25')).not.toEqual(board)
    expect(scoreGarden(board).score).toBeGreaterThanOrEqual(120)
    expect(() => getNightlyPick('2026-02-29')).toThrow(RangeError)
  })
})

describe('countdown to the next daily puzzle', () => {
  it('counts down to the next Beijing midnight', () => {
    // 2026-09-24 21:00 Beijing time is 13:00 UTC.
    const remaining = msUntilNextDaily(Date.UTC(2026, 8, 24, 13, 0))
    expect(remaining).toBe(3 * 60 * 60 * 1000)
    expect(msUntilNextDaily(Date.UTC(2026, 8, 24, 15, 59, 59))).toBe(1000)
    expect(msUntilNextDaily(Date.UTC(2026, 8, 24, 16, 0))).toBe(0)
  })
})

describe('best possible daily score', () => {
  it('beats a player who always takes the first offer on the first empty beat', () => {
    for (const date of ['2026-09-24', '2026-10-03', '2026-12-31']) {
      let naive = emptyBoard()
      for (let round = 0; round < DAILY_ROUNDS; round += 1) {
        naive[naive.findIndex((kind) => kind === null)] = getDailyOffers(date, round)[0]
      }
      const best = bestDailyScore(date)
      expect(best).toBeGreaterThanOrEqual(scoreDailyGarden(naive, date).score)
      expect(best).toBeGreaterThan(scoreDailyGarden(naive, date).score - 60)
      // 60 seeds + 30 + 25 + 25 + 20 + 12 + 25 + 15 bonuses.
      expect(best).toBeLessThanOrEqual(212)
    }
  })

  it('is stable for a date and rejects impossible dates', () => {
    expect(bestDailyScore('2026-09-24')).toBe(bestDailyScore('2026-09-24'))
    expect(() => bestDailyScore('2026-02-29')).toThrow(RangeError)
  })
})

describe('garden hint', () => {
  it('finds the one beat worth the most points', () => {
    const garden = boardWith([0, 'heart'], [1, 'rain'], [4, 'heart'])
    const hint = suggestNextMove(garden)
    expect(hint).toEqual({ index: 5, kind: 'rain', score: 103, gain: 39 })
    expect(hint?.score).toBe(scoreGarden(plantSeed(garden, 5, 'rain')).score)
  })

  it('may clear a planted beat when that scores higher', () => {
    const crowded = boardWith([0, 'heart'], [4, 'rain'], [5, 'rain'], [6, 'rain'], [7, 'rain'])
    const hint = suggestNextMove(crowded, { kinds: ['heart'] })
    expect(hint?.index).toBe(4)
    expect(hint?.kind).toBe('heart')
    expect(hint?.gain).toBe(34)
  })

  it('returns nothing when the record cannot be improved in one beat', () => {
    const full = boardWith(
      [0, 'heart'],
      [1, 'rain'],
      [2, 'bell'],
      [3, 'echo'],
      [4, 'heart'],
      [5, 'rain'],
      [6, 'bell'],
      [7, 'echo'],
    )
    expect(suggestNextMove(full)).toBeNull()
    expect(suggestNextMove(full, { kinds: ['heart'] })).toBeNull()
  })

  it('scores with the caller’s rules, so a daily hint chases the postmark', () => {
    const date = '2026-09-24'
    const { featuredSlot, featuredKind } = getDailyPattern(date)
    const hint = suggestNextMove(emptyBoard(), {
      score: (candidate) => scoreDailyGarden(candidate, date),
    })
    expect(hint?.index).toBe(featuredSlot)
    expect(hint?.kind).toBe(featuredKind)
    expect(hint?.gain).toBe(35)
  })
})
