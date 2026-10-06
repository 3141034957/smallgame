import { farmStickRadius, farmStickVector } from './presentation'
import type { Point } from './rules.mjs'

// Coordinates are percentages of the field box, matching pointer aim input.
export type FarmStick = { vector: Point | null; base: Point; knob: Point }

type Options = {
  canMove: () => boolean
  bounds: () => Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
  refreshBounds: () => void
  target: (point: Point) => void
  stick: (stick: FarmStick) => void
  stop: () => void
}

export function bindFarmControls(field: HTMLElement, options: Options) {
  let activePointer: number | null = null
  let origin: [number, number] | null = null
  const removers: (() => void)[] = []
  const listen = (name: string, callback: EventListener, settings?: AddEventListenerOptions) => {
    field.addEventListener(name, callback, settings)
    removers.push(() => field.removeEventListener(name, callback, settings))
  }
  const move = (x: number, y: number) => {
    const rect = options.bounds()
    if (!rect.width || !rect.height) return
    options.target([((x - rect.left) / rect.width) * 100, ((y - rect.top) / rect.height) * 100])
  }
  const percent = (x: number, y: number): Point => {
    const rect = options.bounds()
    return [((x - rect.left) / rect.width) * 100, ((y - rect.top) / rect.height) * 100]
  }
  // Touch keeps the press point as a fixed stick base: direction comes from the
  // offset, so the camera can follow without the hero chasing the finger.
  const stickAt = (x: number, y: number) => {
    const rect = options.bounds()
    if (!rect.width || !rect.height || !origin) return
    const radius = farmStickRadius(rect.width, rect.height)
    const dx = x - origin[0],
      dy = y - origin[1]
    const distance = Math.hypot(dx, dy)
    const pull = distance > radius ? radius / distance : 1
    options.stick({
      vector: farmStickVector(dx, dy, rect.width, rect.height, radius),
      base: percent(origin[0], origin[1]),
      knob: percent(origin[0] + dx * pull, origin[1] + dy * pull),
    })
  }
  // HUD overlays inside the field are fair game; anything else belongs to a
  // button or a dialog and must keep its own pointer handling.
  const onField = (event: Event) => field.contains(event.target as Node)
  const reset = () => {
    const pointer = activePointer
    activePointer = null
    origin = null
    if (pointer !== null && field.hasPointerCapture?.(pointer)) field.releasePointerCapture(pointer)
    options.stop()
  }
  if ('PointerEvent' in field.ownerDocument.defaultView!) {
    listen('pointerenter', () => options.refreshBounds())
    listen('pointerdown', (raw) => {
      const event = raw as PointerEvent
      // Only the primary button aims: a right or middle click must not turn the hero.
      if (event.button !== 0) return
      if (!options.canMove() || !onField(event) || event.isPrimary === false) return
      options.refreshBounds()
      if (event.pointerType !== 'mouse') {
        if (activePointer !== null) return
        activePointer = event.pointerId
        origin = [event.clientX, event.clientY]
        field.setPointerCapture?.(event.pointerId)
        stickAt(event.clientX, event.clientY)
        return
      }
      move(event.clientX, event.clientY)
    })
    listen('pointermove', (raw) => {
      const event = raw as PointerEvent
      if (!options.canMove() || event.isPrimary === false) return
      if (event.pointerType === 'mouse') move(event.clientX, event.clientY)
      else if (activePointer === event.pointerId) stickAt(event.clientX, event.clientY)
    })
    const release = (raw: Event) => {
      const event = raw as PointerEvent
      if (activePointer !== event.pointerId) return
      reset()
      if (field.hasPointerCapture?.(event.pointerId)) field.releasePointerCapture(event.pointerId)
    }
    listen('pointerup', release)
    listen('pointercancel', release)
    listen('lostpointercapture', release)
    listen('pointerleave', (raw) => {
      if ((raw as PointerEvent).pointerType === 'mouse') options.stop()
    })
  } else {
    // Older embedded webviews can expose touch/mouse events without PointerEvent.
    listen('mouseenter', () => options.refreshBounds())
    listen('mousemove', (raw) => {
      const event = raw as MouseEvent
      if (options.canMove()) move(event.clientX, event.clientY)
    })
    listen('mouseleave', () => options.stop())
    listen(
      'touchstart',
      (raw) => {
        const event = raw as TouchEvent
        if (!options.canMove() || !onField(event) || activePointer !== null) return
        const touch = event.changedTouches[0]
        if (!touch) return
        options.refreshBounds()
        activePointer = touch.identifier
        origin = [touch.clientX, touch.clientY]
        event.preventDefault()
        stickAt(touch.clientX, touch.clientY)
      },
      { passive: false },
    )
    listen(
      'touchmove',
      (raw) => {
        const event = raw as TouchEvent
        if (!options.canMove()) return
        const touch = Array.from(event.touches).find((touch) => touch.identifier === activePointer)
        if (!touch) return
        event.preventDefault()
        stickAt(touch.clientX, touch.clientY)
      },
      { passive: false },
    )
    const release = (raw: Event) => {
      const event = raw as TouchEvent
      if (Array.from(event.changedTouches).some((touch) => touch.identifier === activePointer))
        reset()
    }
    listen('touchend', release)
    listen('touchcancel', release)
  }
  return {
    reset,
    dispose: () => {
      removers.forEach((remove) => remove())
      reset()
    },
  }
}
