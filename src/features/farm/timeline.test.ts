import { describe, expect, it } from 'vitest'
import { farmTimelinePath, farmTimelineSample, FARM_SAMPLE_EVERY } from './timeline'
import { FPS, createFarm } from './rules.mjs'

const sample = (tick: number, score: number, hp = 100, level = 0, bosses = 0) => ({ tick, score, hp, maxHp: 100, level, bosses })

describe('run recap timeline', () => {
  it('samples the live state every two seconds', () => {
    expect(FARM_SAMPLE_EVERY).toBe(2 * FPS)
    expect(farmTimelineSample(createFarm('2026-10-04'))).toEqual({ tick: 0, score: 0, hp: 100, maxHp: 100, level: 0, bosses: 0 })
  })
  it('draws a flat line for a single sample and scales peaks to the top', () => {
    expect(farmTimelinePath([], 100, 40, (item) => item.score)).toBe('')
    // A lone sample is both the floor and the peak, so it sits at the top.
    expect(farmTimelinePath([sample(0, 5)], 100, 40, (item) => item.score)).toBe('0.0,0.0')
    const flat = [sample(0, 10), sample(32, 10)]
    expect(farmTimelinePath(flat, 100, 40, (item) => item.score)).toBe('0.0,0.0 100.0,0.0')
    const rising = [sample(0, 0), sample(32, 50), sample(64, 100)]
    expect(farmTimelinePath(rising, 100, 40, (item) => item.score)).toBe('0.0,40.0 50.0,20.0 100.0,0.0')
    expect(farmTimelinePath(rising, 100, 40, (item) => item.hp)).toBe('0.0,0.0 50.0,0.0 100.0,0.0')
    expect(farmTimelinePath([sample(0, 0), sample(64, 100)], 0, 40, (item) => item.score)).toBe('')
  })
  it('keeps health inside the box even when the run ends at zero', () => {
    const dropping = [sample(0, 0, 100), sample(32, 10, 60), sample(64, 20, 0)]
    expect(farmTimelinePath(dropping, 100, 50, (item) => item.hp)).toBe('0.0,0.0 50.0,20.0 100.0,50.0')
  })
})
