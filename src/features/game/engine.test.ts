import { describe, expect, it } from 'vitest'
import {
  clamp,
  createPlatform,
  createPlatforms,
  ensurePlatformsThrough,
  formatScore,
  progressionSpeed,
  slotHorizontalSpread,
  slotScale,
  slotY,
} from './engine'

describe('game engine', () => {
  it('clamps player movement to the requested range', () => {
    expect(clamp(-2, -1, 1)).toBe(-1)
    expect(clamp(0.25, -1, 1)).toBe(0.25)
    expect(clamp(2, -1, 1)).toBe(1)
  })

  it('uses the safe route and star cadence during the opening', () => {
    const platforms = createPlatforms(() => 0.5)
    expect(platforms).toHaveLength(80)
    expect(platforms[1]).toMatchObject({ x: 0.28, width: 0.88, reward: 1 })
    expect(platforms[6]).toMatchObject({ treat: 'star', note: undefined })
  })

  it('creates deterministic rewards and notes with an injected random source', () => {
    const rewardPlatform = createPlatform(7, 0, () => 0)
    expect(rewardPlatform.reward).toBe(1.5)
    expect(rewardPlatform.note).toBeUndefined()

    const values = [0.5, 0.05, 0]
    const notePlatform = createPlatform(8, 0, () => values.shift() ?? 0.5)
    expect(notePlatform.reward).toBe(1)
    expect(notePlatform.note).toBe('quarter')
  })

  it('extends an existing platform buffer through the target id', () => {
    const platforms = [createPlatform(6, 0, () => 0.5)]
    ensurePlatformsThrough(platforms, 9, () => 0.5)
    expect(platforms.map((platform) => platform.id)).toEqual([6, 7, 8, 9])
  })

  it('caps progression speed and produces stable scene transforms', () => {
    expect(progressionSpeed(0)).toBe(1)
    expect(progressionSpeed(10)).toBe(1.05)
    expect(progressionSpeed(1_000)).toBe(1.7)
    expect(slotY(0)).toBe(84)
    expect(slotY(-1)).toBe(114)
    expect(slotScale(0)).toBe(1)
    expect(slotHorizontalSpread(1)).toBeCloseTo(0.46)
  })

  it('formats scores for the HUD', () => {
    expect(formatScore(42)).toBe('00042')
    expect(formatScore(123_456)).toBe('123456')
  })
})
