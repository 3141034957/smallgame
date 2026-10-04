import { describe, expect, it } from 'vitest'
import { CAST, decodeShow, encodeShow, replayTour, simulateTourShot } from './tour.mjs'
import { replayRound } from './rules.mjs'
import { qqSongLink } from './music'

describe('three-act musical performances', () => {
  it('gives each performer a distinct ability and keeps portal jumps out of normal trails', () => {
    const scores = CAST.map(({ id }) => simulateTourShot('2026-10-04', 0, { angle: 20, power: 95, character: id })!.score)
    expect(new Set(scores).size).toBeGreaterThan(2)
    const bear = simulateTourShot('2026-10-04', 0, { angle: 20, power: 95, character: 'bear' })!
    expect(bear.events.filter((event) => event.kind === 'skill')).toHaveLength(2)
    const moon = simulateTourShot('2026-10-04', 2, { angle: -65, power: 95, character: 'rabbit' })!
    expect(moon.events.filter((event) => event.kind === 'portal').length).toBeGreaterThan(0)
    expect(moon.path.filter((point) => point.jump).length).toBe(moon.events.filter((event) => event.kind === 'portal').length)
  })
  it('replays every role and act deterministically without duplicate hits or unpaid bonuses', () => {
    for (const character of CAST.map((member) => member.id)) for (const act of [0, 1, 2]) for (const angle of [-65, 0, 20, 65]) {
      const aim = { angle, power: 95, character }
      const result = simulateTourShot('2026-10-04', act, aim)!
      expect(simulateTourShot('2026-10-04', act, aim, false)).toEqual({ ...result, path: [] })
      const hits = result.events.filter((event) => event.id >= 0)
      expect(new Set(hits.map((event) => event.id)).size).toBe(result.hits)
      expect(result.hits).toBeLessThanOrEqual(21)
      expect(result.score).toBe(result.events.reduce((sum, event) => sum + event.points, 0))
      let total = 0
      for (const event of result.events) { total += event.points; expect(event.total).toBe(total) }
      expect(result.path.every((point) => Number.isFinite(point.x + point.y))).toBe(true)
    }
  })
  it('shares reproducible music instead of trusting a score or allowing unsupported characters', () => {
    const shots = CAST.slice(0, 3).map(({ id }) => ({ angle: 20, power: 95, character: id }))
    expect(decodeShow(encodeShow(shots))).toEqual(shots)
    const round = replayTour('2026-10-04', shots)!
    expect(round.voices.reduce((sum, count) => sum + count, 0)).toBe(round.hits)
    expect(round.score).toBe(shots.reduce((sum, shot, index) => sum + simulateTourShot(round.day, index, shot)!.score, 0))
    for (const value of ['', '0,95,9;0,95,0;0,95,0', '66,95,0;0,95,0;0,95,0', '0,95,0;0,95,0']) expect(decodeShow(value)).toBeNull()
    expect(replayTour(round.day, [{ angle: 0, power: 95, character: 'fake' }, ...shots.slice(1)] as typeof shots)).toBeNull()
    expect(replayTour(round.day, shots.slice(0, 2))).toBeNull()
    expect(replayRound(round.day, [{ angle: 0, power: 95 }, { angle: -25, power: 95 }, { angle: 25, power: 95 }])!.score).toBe(7330)
  })
  it('only creates outbound music links to explicit QQ Music HTTPS hosts', () => {
    expect(qqSongLink('https://y.qq.com/n/ryqq/songDetail/example')).toContain('y.qq.com')
    for (const link of ['javascript:alert(1)', 'https://y.qq.com.evil.test/', 'https://y.qq.com@evil.test/', 'http://y.qq.com/', 'https://y.qq.com:8080/']) expect(qqSongLink(link)).toBe('')
  })
})
