import { describe, expect, it } from 'vitest'
import {
  aimFromDrag,
  DEFAULT_AIM,
  makeGarden,
  MAX_TIME,
  replayRound,
  simulateShot,
  validAim,
  WIDTH,
} from './rules.mjs'

describe('musical bounce physics and scoring', () => {
  it('replays the exact same impacts, chain and trajectory from quantized inputs', () => {
    const first = simulateShot('2026-10-04', 0, { angle: 20, power: 95 })!
    expect(simulateShot('2026-10-04', 0, { angle: 20, power: 95 })).toEqual(first)
    expect(simulateShot('2026-10-04', 0, { angle: 20, power: 95 }, false)).toEqual({
      ...first,
      path: [],
    })
    expect(first.combo).toBeGreaterThanOrEqual(12)
    expect(first.score).toBeGreaterThan(
      simulateShot('2026-10-04', 0, { angle: 40, power: 95 })!.score,
    )
  })
  it('makes the first default gesture rewarding across dates, without awarding phantom impacts', () => {
    for (const day of [
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-11-01',
      '2027-01-01',
      '2027-04-19',
    ]) {
      const shot = simulateShot(day, 0, DEFAULT_AIM)!
      expect(shot.combo).toBeGreaterThanOrEqual(4)
      expect(shot.events[0].id).toBe(20)
      expect(shot.events[0].kind).toBe('burst')
      const impacts = shot.events.filter((event) => !event.fever)
      expect(new Set(impacts.map((event) => event.id)).size).toBe(shot.hits)
      expect(shot.score).toBe(shot.events.reduce((sum, event) => sum + event.points, 0))
      expect(shot.events.at(-1)?.total).toBe(shot.score)
    }
  })
  it('awards each flower once, pays fever thresholds once, and stays bounded for extreme aims', () => {
    for (const angle of [-65, -40, -20, 0, 20, 40, 65])
      for (const power of [45, 75, 100]) {
        const shot = simulateShot('2026-10-04', 1, { angle, power })!
        expect(shot.hits).toBeLessThanOrEqual(21)
        expect(shot.combo).toBe(shot.hits)
        expect(shot.fevers).toBe(Math.floor(shot.combo / 6))
        expect(shot.duration).toBeLessThanOrEqual(MAX_TIME)
        for (const point of shot.path) {
          expect(Number.isFinite(point.x + point.y)).toBe(true)
          expect(point.x).toBeGreaterThanOrEqual(0)
          expect(point.x).toBeLessThanOrEqual(WIDTH)
        }
        for (const event of shot.events.filter((event) => event.fever))
          expect(event.points).toBe(400)
      }
  })
  it('gives everyone the same garden, with distinct daily layouts and three fresh waves', () => {
    expect(makeGarden('2026-10-04', 0)).toEqual(makeGarden('2026-10-04', 0))
    expect(makeGarden('2026-10-04', 0)).not.toEqual(makeGarden('2026-10-05', 0))
    expect(makeGarden('2026-10-04', 0)).not.toEqual(makeGarden('2026-10-04', 1))
    expect(() => makeGarden('2026-02-30')).toThrow()
    expect(() => makeGarden('2026-10-04', 3)).toThrow()
  })
  it('turns a pull into the opposite launch direction and clamps force and angle', () => {
    expect(aimFromDrag(0, 0)).toEqual(DEFAULT_AIM)
    expect(aimFromDrag(-25, 60).angle).toBeGreaterThan(0)
    expect(aimFromDrag(25, 60).angle).toBeLessThan(0)
    expect(aimFromDrag(1000, 20)).toEqual({ angle: -65, power: 100 })
    expect(aimFromDrag(0, 10)).toEqual({ angle: 0, power: 45 })
  })
  it('requires exactly three legal shots and derives totals and achievements from their impacts', () => {
    const aims = [DEFAULT_AIM, { angle: -25, power: 95 }, { angle: 25, power: 95 }]
    const round = replayRound('2026-10-04', aims)!
    expect(round.score).toBe(
      aims.reduce((sum, aim, index) => sum + simulateShot(round.day, index, aim)!.score, 0),
    )
    expect(round.maxCombo).toBe(19)
    expect(round.fevers).toBe(4)
    for (const invalid of [
      null,
      {},
      { angle: NaN, power: 90 },
      { angle: 0, power: Infinity },
      { angle: 65.5, power: 90 },
      { angle: 66, power: 90 },
      { angle: 0, power: 44 },
      { angle: 0, power: 101 },
    ])
      expect(validAim(invalid)).toBeFalsy()
    expect(replayRound(round.day, aims.slice(0, 2))).toBeNull()
    expect(replayRound(round.day, [...aims, DEFAULT_AIM])).toBeNull()
    expect(replayRound('2026-02-30', aims)).toBeNull()
    expect(replayRound(round.day, [{ angle: 0, power: 101 }, ...aims.slice(1)])).toBeNull()
  })
})
