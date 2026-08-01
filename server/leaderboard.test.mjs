import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER_ID,
  MAX_SCORE,
  normalizeCharacterId,
  normalizeScoreInput,
  rankLeaderboardEntries,
} from './leaderboard.mjs'

describe('leaderboard rules', () => {
  it('normalizes valid score submissions', () => {
    expect(MAX_SCORE).toBe(2_000_000)
    expect(normalizeScoreInput({ name: '  云  朵猫  ', score: 42.9 })).toEqual({
      name: '云 朵猫',
      score: 42,
    })
    expect(normalizeScoreInput({ name: 'abcdefghijklmnop', score: MAX_SCORE })).toEqual({
      name: 'abcdefghijkl',
      score: MAX_SCORE,
    })
  })

  it('rejects malformed score submissions', () => {
    expect(normalizeScoreInput({ name: '', score: 1 })).toBeNull()
    expect(normalizeScoreInput({ name: 'cat', score: -1 })).toBeNull()
    expect(normalizeScoreInput({ name: 'cat', score: Number.NaN })).toBeNull()
    expect(normalizeScoreInput(null)).toBeNull()
  })

  it('keeps supported characters and defaults old data to burger dog', () => {
    expect(normalizeCharacterId('neon')).toBe('neon')
    expect(normalizeCharacterId(undefined)).toBe(DEFAULT_CHARACTER_ID)
    expect(normalizeCharacterId('unknown-character')).toBe(DEFAULT_CHARACTER_ID)
  })

  it('ranks scores with deterministic tie breaking without mutating input', () => {
    const entries = [
      { name: '晚提交', score: 200, characterId: 'neon', updatedAt: 20 },
      { name: '低分', score: 100, updatedAt: 1 },
      { name: '早提交', score: 200, updatedAt: 10 },
    ]
    expect(rankLeaderboardEntries(entries)).toEqual([
      { rank: 1, characterId: 'burger-dog', name: '早提交', score: 200 },
      { rank: 2, characterId: 'neon', name: '晚提交', score: 200 },
      { rank: 3, characterId: 'burger-dog', name: '低分', score: 100 },
    ])
    expect(entries[0].name).toBe('晚提交')
  })

  it('limits the public leaderboard to 100 entries', () => {
    const entries = Array.from({ length: 120 }, (_, index) => ({
      name: `player-${index}`,
      score: index,
      updatedAt: index,
    }))
    const ranked = rankLeaderboardEntries(entries)
    expect(ranked).toHaveLength(100)
    expect(ranked[0]).toMatchObject({ rank: 1, score: 119 })
    expect(ranked[99]).toMatchObject({ rank: 100, score: 20 })
  })
})
