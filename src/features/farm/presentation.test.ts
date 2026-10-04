import { describe, expect, it } from 'vitest'
import { advanceFarmPosition, farmBossCountdown, farmPointerTarget, farmStickRadius, farmStickVector, farmCamera, farmOffscreenMarkers, farmVisibleTiles, formatFarmTime, FARM_STICK_DEAD_ZONE } from './presentation'
import { clampPoint, FPS, MOVE_STEP, type Point } from './rules.mjs'

describe('farm display motion', () => {
  it('shows elapsed survival time across minute and hour boundaries', () => {
    for (const [seconds, expected] of [[0, '00:00'], [30, '00:30'], [60, '01:00'], [3599, '59:59'], [3600, '1:00:00'], [3661, '1:01:01']] as const) {
      expect(formatFarmTime(seconds * FPS)).toBe(expected)
    }
    expect(formatFarmTime(60 * FPS - 1)).toBe('00:59')
  })
  it('moves on every display frame between fixed simulation ticks, without changing the replay position', () => {
    let authority: Point = [50, 76], displayed: Point = [...authority], elapsed = 0
    const target: Point = [90, 40], positions: Point[] = []
    for (let frame = 0; frame < 15; frame++) {
      elapsed += 1000 / 60
      if (elapsed >= 1000 / FPS) { authority = clampPoint(authority, target); elapsed -= 1000 / FPS }
      const original = [...authority]
      displayed = advanceFarmPosition(displayed, target, authority, 1000 / 60)
      expect(authority).toEqual(original)
      expect(Math.hypot(displayed[0] - authority[0], displayed[1] - authority[1])).toBeLessThanOrEqual(MOVE_STEP + Math.SQRT1_2 + .00001)
      positions.push(displayed)
    }
    expect(new Set(positions.map((point) => point.join(','))).size).toBe(15)
    for (let index = 1; index < positions.length; index++) {
      expect(Math.hypot(positions[index][0] - positions[index - 1][0], positions[index][1] - positions[index - 1][1])).toBeLessThan(2.2)
    }
  })

  it('keeps speed consistent at 30, 60 and 120 Hz and never overshoots a nearby target', () => {
    for (const hz of [30, 60, 120]) {
      let displayed: Point = [50, 50], authority: Point = [50, 50], elapsed = 0
      for (let index = 0; index < hz / 2; index++) {
        elapsed += 1000 / hz
        while (elapsed >= 1000 / FPS) { authority = clampPoint(authority, [97, 50]); elapsed -= 1000 / FPS }
        displayed = advanceFarmPosition(displayed, [97, 50], authority, 1000 / hz)
      }
      expect(displayed[0]).toBeCloseTo(74)
      expect(displayed[1]).toBe(50)
    }
    expect(advanceFarmPosition([50, 50], [50.1, 50.1], [50, 50], 16)).toEqual([50.1, 50.1])
  })

  it('allows travel beyond old edges while bounding prediction and reversal', () => {
    const display: Point = [55, 50], authority: Point = [50, 50]
    const reversed = advanceFarmPosition(display, [3, 50], authority, 16)
    expect(reversed[0]).toBeLessThan(display[0])
    expect(advanceFarmPosition([3, 4], [-100, -100], [3, 4], 16)[0]).toBeLessThan(3)
    expect(advanceFarmPosition([97, 96], [1000, 1000], [97, 96], 16)[0]).toBeGreaterThan(97)
    expect(advanceFarmPosition([50, 50], [90, 50], [50, 50], 1000)[0]).toBeCloseTo(50 + MOVE_STEP + Math.SQRT1_2)
    expect(advanceFarmPosition([50, 50], [90, 50], [50, 50], 0)).toEqual([50, 50])
  })
})

describe('endless world camera', () => {
  it('turns a phone drag into a stick direction and ignores the dead zone', () => {
    const radius = farmStickRadius(360, 430)
    expect(radius).toBeGreaterThanOrEqual(28)
    expect(farmStickVector(0, 0, 360, 430, radius)).toBeNull()
    expect(farmStickVector(radius * FARM_STICK_DEAD_ZONE - 1, 0, 360, 430, radius)).toBeNull()
    expect(farmStickVector(60, 0, 360, 430, radius)).toEqual([MOVE_STEP, 0])
    expect(farmStickVector(0, -60, 360, 430, radius)).toEqual([0, -MOVE_STEP])
    const diagonal = farmStickVector(-40, 40, 360, 430, radius)!
    expect(diagonal[0]).toBeLessThan(0); expect(diagonal[1]).toBeGreaterThan(0)
    expect(Math.hypot(...diagonal)).toBeCloseTo(MOVE_STEP)
    expect(farmStickVector(10, 10, 0, 430, radius)).toBeNull()
  })
  it('points at bosses that are still outside the view and ignores the ones already visible', () => {
    const position: Point = [50, 76]
    const far = [{ x: 50, y: 76 - 120, hp: 40 }, { x: 50 - 130, y: 76, hp: 40 }]
    const markers = farmOffscreenMarkers(position, far, 375, 500)
    expect(markers).toHaveLength(2)
    expect(markers[0].y).toBeLessThan(250)
    expect(markers[0].x).toBeCloseTo(187.5)
    expect(markers[0].angle).toBeCloseTo(-Math.PI / 2)
    expect(markers[1].x).toBeLessThan(187.5)
    expect(markers[1].angle).toBeCloseTo(Math.PI)
    for (const marker of markers) {
      expect(marker.x).toBeGreaterThanOrEqual(0); expect(marker.x).toBeLessThanOrEqual(375)
      expect(marker.y).toBeGreaterThanOrEqual(0); expect(marker.y).toBeLessThanOrEqual(500)
      expect(marker.distance).toBeGreaterThan(0)
    }
    expect(farmOffscreenMarkers(position, [{ x: 50, y: 80, hp: 40 }], 375, 500)).toHaveLength(0)
    expect(farmOffscreenMarkers(position, [{ x: 50, y: 76 - 120, hp: 0 }], 375, 500)).toHaveLength(0)
    expect(farmOffscreenMarkers(position, [], 375, 0)).toHaveLength(0)
  })
  it('counts down to the earlier of the two boss timers', () => {
    expect(farmBossCountdown({ tick: 0, nextBoss: 16 * FPS, nextBass: 90 * FPS })).toBe(16)
    expect(farmBossCountdown({ tick: 20 * FPS, nextBoss: 40 * FPS, nextBass: 90 * FPS })).toBe(20)
    expect(farmBossCountdown({ tick: 500 * FPS, nextBoss: 16 * FPS, nextBass: 90 * FPS })).toBe(0)
  })
  it('keeps a held pointer direction moving as the player passes the original arena', () => {
    let position: Point = [50, 76]
    for (let tick = 0; tick < 120; tick++) position = clampPoint(position, farmPointerTarget(position, [80, 50]))
    expect(position).toEqual([410, 76])
    expect(farmPointerTarget(position, [50, 50])).toEqual(position)
    expect(farmPointerTarget(position, [51, 49])).toEqual(position)
    expect(farmPointerTarget(position, [20, 50])[0]).toBeLessThan(position[0])
  })
  it('centers the player and moves fixed landmarks in the opposite direction at every viewport size', () => {
    for (const [w, h] of [[375, 360], [390, 536], [844, 390], [1661, 667]]) {
      const before = farmCamera([50, 76], w, h), after = farmCamera([153, -224], w, h)
      expect(after.x + 153 * 3.6 * after.scale).toBeCloseTo(w / 2)
      expect(after.y - 224 * 4.3 * after.scale).toBeCloseTo(h / 2)
      expect(after.x - before.x).toBeCloseTo(-103 * 3.6 * after.scale)
      expect(after.y - before.y).toBeCloseTo(300 * 4.3 * after.scale)
    }
  })
  it('covers the whole viewport with stable tiles at negative and distant coordinates using bounded memory', () => {
    for (const position of [[0, 0], [-.1, -.1], [100000, -100000]] as Point[]) {
      const camera = farmCamera(position, 1661, 667), tiles = farmVisibleTiles(camera)
      expect(tiles.length).toBeLessThanOrEqual(20)
      expect(tiles).toEqual(farmVisibleTiles(camera))
      for (const x of [camera.left, (camera.left + camera.right) / 2, camera.right]) {
        for (const y of [camera.top, (camera.top + camera.bottom) / 2, camera.bottom]) {
          expect(tiles.some(tile => tile.x <= x && tile.x + 360 >= x && tile.y <= y && tile.y + 430 >= y)).toBe(true)
        }
      }
    }
  })
})
