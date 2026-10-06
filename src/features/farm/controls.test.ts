import { describe, expect, it } from 'vitest'
import { bindFarmControls, type FarmStick } from './controls'
import { farmWorldBounds } from './presentation'
import type { Point } from './rules.mjs'

function harness(pointerEvents = true) {
  const field = new EventTarget() as EventTarget & {
    ownerDocument: object
    setPointerCapture: (id: number) => void
    hasPointerCapture: (id: number) => boolean
    releasePointerCapture: (id: number) => void
    contains: (node: EventTarget) => boolean
  }
  field.ownerDocument = { defaultView: pointerEvents ? { PointerEvent: class {} } : {} }
  const captures = new Set<number>()
  field.setPointerCapture = (id) => {
    captures.add(id)
  }
  field.hasPointerCapture = (id) => captures.has(id)
  field.releasePointerCapture = (id) => {
    captures.delete(id)
  }
  const canvas = new EventTarget()
  // Everything the field owns takes part in aiming, like a HUD overlay would.
  const owned = new Set<EventTarget>([field, canvas])
  field.contains = (node) => owned.has(node)
  const moves: Point[] = [],
    sticks: FarmStick[] = []
  let playing = true,
    stops = 0
  const controls = bindFarmControls(field as unknown as HTMLElement, {
    canMove: () => playing,
    bounds: () => ({ left: 10, top: 20, width: 360, height: 430 }),
    refreshBounds: () => {},
    target: (point) => {
      moves.push(point)
    },
    stick: (stick) => {
      sticks.push(stick)
    },
    stop: () => {
      stops++
    },
  })
  const send = (name: string, data: object = {}, target: EventTarget = field) => {
    const event = new Event(name, { cancelable: true })
    Object.assign(
      event,
      {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: 190,
        clientY: 235,
      },
      data,
    )
    Object.defineProperty(event, 'target', { value: target })
    field.dispatchEvent(event)
    return event
  }
  return {
    send,
    moves,
    sticks,
    captures,
    controls,
    canvas,
    owned,
    setPlaying: (value: boolean) => {
      playing = value
    },
    stops: () => stops,
  }
}

describe('farm controls across devices', () => {
  it('follows hovering mouse movement without a pressed button, and stops on leaving the field', () => {
    const h = harness()
    h.send('pointermove', { buttons: 0 })
    expect(h.moves).toEqual([[50, 50]])
    expect(h.sticks).toHaveLength(0)
    h.send('pointerup')
    expect(h.stops()).toBe(0)
    h.send('pointerleave')
    expect(h.stops()).toBe(1)
    h.controls.dispose()
    h.send('pointermove')
    expect(h.moves).toHaveLength(1)
  })
  it('steers touch as a stick anchored at the press point, ignoring extra fingers', () => {
    const h = harness()
    h.send('pointermove', { pointerType: 'touch' })
    expect(h.sticks).toHaveLength(0)
    h.send('pointerdown', { pointerType: 'touch' }, h.canvas)
    expect(h.captures.has(1)).toBe(true)
    // The press alone is the stick base: no direction yet, so the hero stands.
    expect(h.sticks.at(-1)).toMatchObject({ vector: null, base: [50, 50], knob: [50, 50] })
    h.send('pointermove', { pointerType: 'touch', clientX: 226, clientY: 278 })
    const pulled = h.sticks.at(-1)!
    expect(pulled.vector![0]).toBeGreaterThan(0)
    expect(pulled.vector![1]).toBeGreaterThan(0)
    expect(pulled.base).toEqual([50, 50])
    // Dragging past the radius only moves the knob to the rim.
    h.send('pointermove', { pointerType: 'touch', clientX: 190, clientY: 1200 })
    expect(h.sticks.at(-1)!.knob[1]).toBeLessThan(100)
    expect(h.sticks.at(-1)!.vector).toEqual([0, 3])
    h.send('pointermove', { pointerId: 2, pointerType: 'touch', isPrimary: false })
    expect(h.sticks).toHaveLength(3)
    h.send('pointercancel', { pointerType: 'touch' })
    expect(h.stops()).toBe(1)
    expect(h.captures.has(1)).toBe(false)
    h.send('pointermove', { pointerType: 'touch' })
    expect(h.sticks).toHaveLength(3)
    h.send('pointerdown', { pointerId: 3, pointerType: 'touch' })
    h.send('pointerup', { pointerId: 3, pointerType: 'touch' })
    expect(h.stops()).toBe(2)
    h.controls.dispose()
  })
  it('only aims on the primary button and takes presses from overlays inside the field', () => {
    const h = harness()
    h.send('pointerdown', { button: 2 })
    h.send('pointerdown', { button: 1 })
    expect(h.moves).toHaveLength(0)
    h.send('pointerdown', { button: 0 })
    expect(h.moves).toHaveLength(1)
    // A HUD layer that forgets `pointer-events: none` must still steer the hero.
    const overlay = new EventTarget()
    h.owned.add(overlay)
    h.send('pointerdown', { pointerId: 2, pointerType: 'touch' }, overlay)
    expect(h.sticks).toHaveLength(1)
    h.controls.reset()
    h.send('pointerdown', { pointerId: 3 }, new EventTarget())
    expect(h.moves).toHaveLength(1)
    expect(h.sticks).toHaveLength(1)
    h.controls.dispose()
  })
  it('does not hijack buttons or paused menus and retains pointer direction outside the canonical view', () => {
    const h = harness()
    h.send('pointerdown', { pointerType: 'touch' }, new EventTarget())
    expect(h.moves).toHaveLength(0)
    expect(h.sticks).toHaveLength(0)
    h.setPlaying(false)
    h.send('pointerdown')
    h.send('pointermove')
    expect(h.moves).toHaveLength(0)
    h.setPlaying(true)
    h.send('pointermove', { clientX: -1000, clientY: 2000 })
    expect(h.moves[0][0]).toBeLessThan(0)
    expect(h.moves[0][1]).toBeGreaterThan(100)
    h.controls.dispose()
  })
  it('supports touch-only webviews with a non-scrolling stick and release behavior', () => {
    const h = harness(false),
      touch = { identifier: 0, clientX: 190, clientY: 235 }
    expect(h.send('touchstart', { changedTouches: [touch] }).defaultPrevented).toBe(true)
    expect(h.send('touchmove', { touches: [{ ...touch, clientX: 226 }] }).defaultPrevented).toBe(
      true,
    )
    expect(h.sticks.at(-1)!.vector![0]).toBeGreaterThan(0)
    expect(h.sticks.at(-1)!.base).toEqual([50, 50])
    h.send('touchend', { changedTouches: [touch] })
    h.send('touchmove', { touches: [touch] })
    expect(h.sticks).toHaveLength(2)
    expect(h.stops()).toBe(1)
    h.controls.dispose()
  })
  it('releases captured touch on pause/reset and permits the next gesture', () => {
    const h = harness()
    h.send('pointerdown', { pointerType: 'touch' }, h.canvas)
    expect(h.captures.has(1)).toBe(true)
    h.controls.reset()
    expect(h.captures.size).toBe(0)
    expect(h.stops()).toBe(1)
    h.send('lostpointercapture', { pointerType: 'touch' })
    expect(h.stops()).toBe(1)
    h.send('pointerdown', { pointerType: 'touch', pointerId: 2 }, h.canvas)
    expect(h.captures.has(2)).toBe(true)
    h.controls.dispose()
    expect(h.captures.size).toBe(0)
  })
  it('uses identical world proportions on phone and desktop instead of stretching input coordinates', () => {
    for (const [width, height] of [
      [375, 380],
      [1661, 667],
      [844, 185],
    ]) {
      const world = farmWorldBounds({ left: 12, top: 140, width, height })
      expect(world.width / world.height).toBeCloseTo(360 / 430)
      expect(world.left + world.width / 2).toBeCloseTo(12 + width / 2)
      expect(world.top + world.height / 2).toBeCloseTo(140 + height / 2)
      expect(world.width).toBeGreaterThan(0)
      expect((width / world.width) * 100).toBeLessThanOrEqual(250)
      expect((height / world.height) * 100).toBeLessThanOrEqual(198)
    }
  })
})
