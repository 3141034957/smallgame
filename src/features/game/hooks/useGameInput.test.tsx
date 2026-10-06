// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useGameInput } from './useGameInput'
import type { GameStatus } from '../engine'

afterEach(cleanup)
function setup(status: GameStatus = 'playing') {
  const move = { current: 0 }
  const onStart = vi.fn()
  renderHook(() =>
    useGameInput({
      gameRef: { current: null },
      gameBoundsRef: { current: { left: 0, width: 100 } },
      moveDirectionRef: move,
      statusRef: { current: status },
      targetXRef: { current: 0 },
      onStart,
    }),
  )
  return { move, onStart }
}

it('does not consume typing or Enter on editable controls', () => {
  const { move, onStart } = setup('ready')
  const input = document.createElement('input')
  document.body.append(input)
  fireEvent.keyDown(input, { key: 'a' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(move.current).toBe(0)
  expect(onStart).not.toHaveBeenCalled()
  input.remove()
})

it('keeps moving while another direction key is still held', () => {
  const { move } = setup()
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  fireEvent.keyDown(window, { key: 'd' })
  expect(move.current).toBe(1)
  fireEvent.keyUp(window, { key: 'd' })
  expect(move.current).toBe(-1)
  fireEvent.keyUp(window, { key: 'ArrowLeft' })
  expect(move.current).toBe(0)
})

it('clears held movement when the browser loses focus', () => {
  const { move } = setup()
  fireEvent.keyDown(window, { key: 'A' })
  expect(move.current).toBe(-1)
  fireEvent.blur(window)
  expect(move.current).toBe(0)
})

it('ignores shortcuts and repeated start keys', () => {
  const { move, onStart } = setup('ready')
  fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
  fireEvent.keyDown(window, { key: 'Enter', repeat: true })
  expect(move.current).toBe(0)
  expect(onStart).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { key: 'Enter' })
  expect(onStart).toHaveBeenCalledOnce()
})
