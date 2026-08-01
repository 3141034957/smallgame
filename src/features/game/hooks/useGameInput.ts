import { useEffect, useRef } from 'react'
import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        event.preventDefault()
        moveDirectionRef.current = -1
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        event.preventDefault()
        moveDirectionRef.current = 1
      }
      if ((event.key === ' ' || event.key === 'Enter') && statusRef.current === 'ready') {
        event.preventDefault()
        onStartRef.current()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key.toLowerCase() === 'a' ||
        event.key.toLowerCase() === 'd'
      ) {
        moveDirectionRef.current = 0
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [moveDirectionRef, statusRef])

  const updatePointerTarget = (
    event: ReactPointerEvent<HTMLDivElement>,
    refreshBounds = false,
  ) => {
    if (statusRef.current !== 'playing' || !gameRef.current) return
    if (refreshBounds) {
      const bounds = gameRef.current.getBoundingClientRect()
      gameBoundsRef.current = { left: bounds.left, width: bounds.width }
    }
    const bounds = gameBoundsRef.current
    const normalized = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    targetXRef.current = clamp(normalized * 1.12, -1, 1)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePointerTarget(event, true)
  }

  return { handlePointerDown, updatePointerTarget }
}
