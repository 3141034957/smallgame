import type { Point } from './rules.mjs'

type Options = {
  canMove: () => boolean
  bounds: () => Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
  refreshBounds: () => void
  target: (point: Point, mode: 'touch' | 'mouse') => void
  stop: () => void
}

export function bindFarmControls(field: HTMLElement, canvas: HTMLCanvasElement, options: Options) {
  let activePointer: number | null = null
  const removers: (() => void)[] = []
  const listen = (name: string, callback: EventListener, settings?: AddEventListenerOptions) => {
    field.addEventListener(name, callback, settings)
    removers.push(() => field.removeEventListener(name, callback, settings))
  }
  const move = (x: number, y: number, mode: 'touch' | 'mouse') => {
    const rect = options.bounds()
    if (!rect.width || !rect.height) return
    options.target([(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100], mode)
  }
  const onField = (event: Event) => event.target === field || event.target === canvas
  const reset = () => { activePointer = null; options.stop() }
  if ('PointerEvent' in field.ownerDocument.defaultView!) {
    listen('pointerenter', () => options.refreshBounds())
    listen('pointerdown', (raw) => {
      const event = raw as PointerEvent
      if (!options.canMove() || !onField(event) || event.isPrimary === false) return
      options.refreshBounds()
      if (event.pointerType !== 'mouse') {
        if (activePointer !== null) return
        activePointer = event.pointerId
        field.setPointerCapture?.(event.pointerId)
      }
      move(event.clientX, event.clientY, event.pointerType === 'mouse' ? 'mouse' : 'touch')
    })
    listen('pointermove', (raw) => {
      const event = raw as PointerEvent
      if (!options.canMove() || event.isPrimary === false) return
      if (event.pointerType === 'mouse' || activePointer === event.pointerId) move(event.clientX, event.clientY, event.pointerType === 'mouse' ? 'mouse' : 'touch')
    })
    const release = (raw: Event) => {
      const event = raw as PointerEvent
      if (activePointer !== event.pointerId) return
      reset()
      if (field.hasPointerCapture?.(event.pointerId)) field.releasePointerCapture(event.pointerId)
    }
    listen('pointerup', release); listen('pointercancel', release); listen('lostpointercapture', release)
    listen('pointerleave', (raw) => { if ((raw as PointerEvent).pointerType === 'mouse') options.stop() })
  } else {
    // Older embedded webviews can expose touch/mouse events without PointerEvent.
    listen('mouseenter', () => options.refreshBounds())
    listen('mousemove', (raw) => { const event = raw as MouseEvent; if (options.canMove()) move(event.clientX, event.clientY, 'mouse') })
    listen('mouseleave', () => options.stop())
    listen('touchstart', (raw) => {
      const event = raw as TouchEvent
      if (!options.canMove() || !onField(event) || activePointer !== null) return
      const touch = event.changedTouches[0]
      if (!touch) return
      options.refreshBounds(); activePointer = touch.identifier
      event.preventDefault(); move(touch.clientX, touch.clientY, 'touch')
    }, { passive: false })
    listen('touchmove', (raw) => {
      const event = raw as TouchEvent
      if (!options.canMove()) return
      const touch = Array.from(event.touches).find((touch) => touch.identifier === activePointer)
      if (!touch) return
      event.preventDefault(); move(touch.clientX, touch.clientY, 'touch')
    }, { passive: false })
    const release = (raw: Event) => { const event = raw as TouchEvent; if (Array.from(event.changedTouches).some((touch) => touch.identifier === activePointer)) reset() }
    listen('touchend', release); listen('touchcancel', release)
  }
  return { reset, dispose: () => { removers.forEach((remove) => remove()); activePointer = null } }
}
