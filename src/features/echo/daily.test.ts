import { describe, expect, it } from 'vitest'
import { emptyBoard, plantSeed } from './engine'
import type { Board, SeedKind } from './engine'
import { DAILY_ROUNDS, getDailyOffers, getDailyPattern, scoreDailyGarden, scoreGarden } from './daily'

function boardWith(...slots: [number, SeedKind][]): Board {
  return slots.reduce((board, [index, kind]) => plantSeed(board, index, kind), emptyBoard())
}

describe('daily offers', () => {
  it('offers three distinct seeds per round and shows all four over six rounds', () => {
    const rounds = Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyOffers('2026-09-24', index))
    expect(DAILY_ROUNDS).toBe(6)
    expect(rounds.every((offers) => offers.length === 3 && new Set(offers).size === 3)).toBe(true)
    expect(new Set(rounds.flat())).toEqual(new Set(['heart', 'rain', 'bell', 'echo']))
  })

  it('is stable for the same date and changes between adjacent dates', () => {
    const firstDay = Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyOffers('2026-09-24', index))
    const firstDayAgain = Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyOffers('2026-09-24', index))
    const nextDay = Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyOffers('2026-09-25', index))
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
    const slots = [featuredSlot, ...Array.from({ length: 8 }, (_, index) => index)
      .filter((index) => index !== featuredSlot && index !== quietSlot)].slice(0, DAILY_ROUNDS)
    const complete = emptyBoard()
    for (const slot of slots) complete[slot] = slot === featuredSlot ? featuredKind : 'heart'
    const partial = [...complete]
    partial[slots[1]] = null

    expect(scoreDailyGarden(partial, date).bonuses.some((bonus) => bonus.label.startsWith('今日留白'))).toBe(false)
    const scored = scoreDailyGarden(complete, date)
    expect(scored.score).toBe(scoreGarden(complete).score + 40)
    expect(scored.bonuses).toContainEqual({ label: `今日留白 · 第 ${quietSlot + 1} 拍`, points: 15 })
  })

  it('does not award the quiet beat when its specified slot is occupied', () => {
    const { quietSlot } = getDailyPattern(date)
    const slots = [quietSlot, ...Array.from({ length: 8 }, (_, index) => index)
      .filter((index) => index !== quietSlot)].slice(0, DAILY_ROUNDS)
    const board = boardWith(...slots.map((slot): [number, SeedKind] => [slot, 'heart']))
    expect(scoreDailyGarden(board, date).bonuses.some((bonus) => bonus.label.startsWith('今日留白'))).toBe(false)
  })
})

describe('garden score', () => {
  it('awards 10 points per seed and no bonuses for an empty or repetitive layout', () => {
    expect(scoreGarden(emptyBoard())).toEqual({ score: 0, bonuses: [] })
    expect(scoreGarden(boardWith([0, 'heart'], [1, 'heart']))).toEqual({ score: 20, bonuses: [] })
  })

  it('awards each named composition bonus once for a six-seed complete song', () => {
    const garden = boardWith(
      [0, 'heart'], [1, 'rain'], [2, 'bell'], [3, 'echo'], [4, 'heart'], [5, 'rain'],
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
      [0, 'heart'], [1, 'rain'], [2, 'bell'], [3, 'rain'], [4, 'heart'], [7, 'echo'],
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
