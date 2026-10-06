import { useEffect, useRef } from 'react'
import type { MutableRefObject, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { clamp } from '@/features/game/engine'
import type { GameStatus } from '@/features/game/engine'

type GameBounds = { left: number; width: number }

type UseGameInputOptions = {
  gameRef: RefObject<HTMLDivElement | null>
  gameBoundsRef: MutableRefObject<GameBounds>
  moveDirectionRef: MutableRefObject<number>
  statusRef: MutableRefObject<GameStatus>
  targetXRef: MutableRefObject<number>
  onStart: () => void
}

export function useGameInput({
  gameRef,
  gameBoundsRef,
  moveDirectionRef,
  statusRef,
  targetXRef,
  onStart,
}: UseGameInputOptions) {
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart

  useEffect(() => {
    const held = new Map<string, number>()
    const reset = () => {
      held.clear()
      moveDirectionRef.current = 0
    }
    const update = () => {
      moveDirectionRef.current = [...held.values()].at(-1) ?? 0
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        )
      )
        return
      const key = event.key.toLowerCase()
      const direction =
        key === 'arrowleft' || key === 'a' ? -1 : key === 'arrowright' || key === 'd' ? 1 : 0
      if (direction && statusRef.current === 'playing') {
        event.preventDefault()
        if (!held.has(key)) held.set(key, direction)
        update()
      }
      if (
        (event.key === ' ' || event.key === 'Enter') &&
        !event.repeat &&
        statusRef.current === 'ready'
      ) {
        event.preventDefault()
        onStartRef.current()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(event.key.toLowerCase())
      update()
    }
    const onVisibility = () => {
      if (document.hidden) reset()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', onVisibility)
      reset()
    }
  }, [moveDirectionRef, statusRef])

  const updatePointerTarget = (event: ReactPointerEvent<HTMLDivElement>, refreshBounds = false) => {
    if (statusRef.current !== 'playing' || !gameRef.current) return
    if (refreshBounds) {
      const bounds = gameRef.current.getBoundingClientRect()
      gameBoundsRef.current = { left: bounds.left, width: bounds.width }
    }
    const bounds = gameBoundsRef.current
    if (bounds.width <= 0) return
    const normalized = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    targetXRef.current = clamp(normalized * 1.12, -1, 1)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (statusRef.current !== 'playing') return
    if (event.target instanceof Element && event.target.closest('button, input, a')) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updatePointerTarget(event, true)
  }

  return { handlePointerDown, updatePointerTarget }
}
