import { describe, expect, it } from 'vitest'
import { bindFarmControls, type FarmStick } from './controls'
import { farmStickRadius, farmWorldBounds } from './presentation'
import type { Point } from './rules.mjs'

function harness(pointerEvents = true, rect = { left: 10, top: 20, width: 360, height: 430 }) {
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
    bounds: () => rect,
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
  it('keeps short touch drags anchored at the press point and ignores extra fingers', () => {
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
    h.send('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: false })
    h.send('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: true })
    h.send('pointermove', { pointerId: 2, pointerType: 'touch', isPrimary: false })
    h.send('pointermove', { pointerId: 2, pointerType: 'touch', isPrimary: true })
    h.send('pointerup', { pointerId: 2, pointerType: 'touch' })
    expect(h.sticks).toHaveLength(2)
    expect(h.captures).toEqual(new Set([1]))
    expect(h.stops()).toBe(0)
    h.send('pointercancel', { pointerType: 'touch' })
    expect(h.stops()).toBe(1)
    expect(h.captures.has(1)).toBe(false)
    h.send('pointermove', { pointerType: 'touch' })
    expect(h.sticks).toHaveLength(2)
    h.send('pointerdown', { pointerId: 3, pointerType: 'touch' })
    h.send('pointerup', { pointerId: 3, pointerType: 'touch' })
    expect(h.stops()).toBe(2)
    h.controls.dispose()
  })
  it('keeps its dead zone and lets a long drag reverse near the finger', () => {
    const h = harness(),
      radius = farmStickRadius(360, 430)
    h.send('pointerdown', { pointerType: 'touch' })
    h.send('pointermove', { pointerType: 'touch', clientX: 190 + radius * 0.1 })
    expect(h.sticks.at(-1)).toMatchObject({ vector: null, base: [50, 50] })
    h.send('pointermove', { pointerType: 'touch', clientX: 1190 })
    const pulled = h.sticks.at(-1)!
    expect(pulled.vector).toEqual([3, 0])
    expect(((pulled.knob[0] - pulled.base[0]) / 100) * 360).toBeCloseTo(radius)
    expect(pulled.knob[0]).toBeCloseTo(((1190 - 10) / 360) * 100)
    h.send('pointermove', { pointerType: 'touch', clientX: 1190 - radius })
    expect(h.sticks.at(-1)!.vector).toBeNull()
    h.send('pointermove', { pointerType: 'touch', clientX: 1190 - radius * 1.4 })
    expect(h.sticks.at(-1)!.vector).toEqual([-3, 0])
    expect(h.sticks.at(-1)!.base).toEqual(pulled.base)
    h.controls.dispose()
  })
  it.each([
    [360, 430],
    [900, 240],
    [240, 900],
  ])('keeps diagonal drags circular in screen pixels on a %s × %s field', (width, height) => {
    const h = harness(true, { left: 10, top: 20, width, height }),
      radius = farmStickRadius(width, height),
      diagonal = radius / Math.SQRT2,
      x = 10 + width / 2,
      y = 20 + height / 2
    h.send('pointerdown', { pointerType: 'touch', clientX: x, clientY: y })
    h.send('pointermove', {
      pointerType: 'touch',
      clientX: x + diagonal * 5,
      clientY: y + diagonal * 5,
    })
    const pulled = h.sticks.at(-1)!,
      dx = ((pulled.knob[0] - pulled.base[0]) / 100) * width,
      dy = ((pulled.knob[1] - pulled.base[1]) / 100) * height
    expect(Math.hypot(dx, dy)).toBeCloseTo(radius)
    expect(dx).toBeCloseTo(dy)
    expect(pulled.vector![0] * width).toBeCloseTo(pulled.vector![1] * height)
    expect(pulled.base[0]).toBeCloseTo(50 + ((diagonal * 4) / width) * 100)
    expect(pulled.base[1]).toBeCloseTo(50 + ((diagonal * 4) / height) * 100)
    h.send('pointermove', {
      pointerType: 'touch',
      clientX: x + diagonal * 3.6,
      clientY: y + diagonal * 3.6,
    })
    expect(h.sticks.at(-1)!.vector![0]).toBeLessThan(0)
    expect(h.sticks.at(-1)!.vector![1]).toBeLessThan(0)
    h.controls.dispose()
  })
  it('keeps touch in control while a mouse moves or leaves, then resumes mouse hovering', () => {
    const h = harness()
    h.send('pointerdown', { pointerType: 'touch' })
    h.send('pointermove', { pointerType: 'touch', clientX: 226 })
    h.send('pointerdown', { pointerId: 2 })
    h.send('pointermove', { pointerId: 2 })
    h.send('pointerleave', { pointerId: 2 })
    expect(h.moves).toHaveLength(0)
    expect(h.sticks).toHaveLength(2)
    expect(h.stops()).toBe(0)
    h.send('pointerup', { pointerType: 'touch' })
    h.send('pointermove', { pointerId: 2 })
    expect(h.moves).toEqual([[50, 50]])
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
  it('floats the touch-only webview stick without letting a second finger or mouse take over', () => {
    const h = harness(false),
      radius = farmStickRadius(360, 430),
      touch = { identifier: 0, clientX: 190, clientY: 235 },
      extra = { identifier: 1, clientX: 100, clientY: 100 },
      dragged = { ...touch, clientX: 1190 }
    h.send('touchstart', { changedTouches: [touch] })
    expect(h.send('touchstart', { changedTouches: [extra] }).defaultPrevented).toBe(true)
    expect(h.sticks).toHaveLength(1)
    h.send('touchmove', { touches: [extra, dragged] })
    const pulled = h.sticks.at(-1)!
    expect(pulled.vector).toEqual([3, 0])
    expect(((pulled.knob[0] - pulled.base[0]) / 100) * 360).toBeCloseTo(radius)
    h.send('touchend', { changedTouches: [extra] })
    h.send('touchcancel', { changedTouches: [extra] })
    h.send('mousemove')
    h.send('mouseleave')
    expect(h.moves).toHaveLength(0)
    expect(h.stops()).toBe(0)
    h.send('touchmove', { touches: [{ ...dragged, clientX: dragged.clientX - radius * 1.4 }] })
    expect(h.sticks.at(-1)!.vector).toEqual([-3, 0])
    h.send('touchcancel', { changedTouches: [touch] })
    h.send('touchmove', { touches: [extra] })
    expect(h.sticks).toHaveLength(3)
    expect(h.stops()).toBe(1)
    h.send('mousemove')
    expect(h.moves).toEqual([[50, 50]])
    h.controls.dispose()
  })
  it('forgets the touch-only webview gesture on reset and removes handlers on disposal', () => {
    const h = harness(false),
      touch = { identifier: 0, clientX: 190, clientY: 235 }
    h.send('touchstart', { changedTouches: [touch] })
    h.controls.reset()
    h.send('touchmove', { touches: [touch] })
    expect(h.sticks).toHaveLength(1)
    h.send('touchstart', { changedTouches: [{ ...touch, identifier: 1 }] })
    expect(h.sticks).toHaveLength(2)
    h.controls.dispose()
    expect(h.stops()).toBe(2)
    h.send('touchstart', { changedTouches: [touch] })
    h.send('touchmove', { touches: [touch] })
    h.send('touchend', { changedTouches: [touch] })
    h.send('mousemove')
    expect(h.sticks).toHaveLength(2)
    expect(h.moves).toHaveLength(0)
    expect(h.stops()).toBe(2)
  })
  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
    'stops a touch once on %s and allows the next gesture',
    (release) => {
      const h = harness()
      h.send('pointerdown', { pointerType: 'touch' })
      h.send('pointermove', { pointerType: 'touch', clientX: 1190 })
      if (release === 'lostpointercapture') h.captures.delete(1)
      h.send(release, { pointerType: 'touch' })
      expect(h.captures.size).toBe(0)
      expect(h.stops()).toBe(1)
      h.send('lostpointercapture', { pointerType: 'touch' })
      h.send('pointermove', { pointerType: 'touch' })
      expect(h.stops()).toBe(1)
      expect(h.sticks).toHaveLength(2)
      h.send('pointerdown', { pointerType: 'touch', pointerId: 2 })
      expect(h.sticks.at(-1)).toMatchObject({ vector: null, base: [50, 50], knob: [50, 50] })
      expect(h.captures).toEqual(new Set([2]))
      h.controls.dispose()
    },
  )
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
