// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FarmBoard } from './FarmBoard'
import { melodyRequest } from '@/features/melody/leaderboard'
import type { FarmRound } from '@/features/farm/rules.mjs'
import { NICKNAME_STORAGE_KEY } from '@/utils/playerIdentity'
import { testStorage } from '@/test/storage'

vi.mock('@/features/melody/leaderboard', () => ({ melodyRequest: vi.fn() }))
const board = { data: [], own: null, total: 0 }
const round = {
  day: '2026-10-06',
  score: 100,
  frames: [],
  choices: [],
  surges: [],
} as unknown as FarmRound
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  localStorage.clear()
  localStorage.setItem(NICKNAME_STORAGE_KEY, '小乐手')
  vi.mocked(melodyRequest).mockImplementation(async (_path, signal) => {
    await Promise.resolve()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return board
  })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

it('completes automatic submission under the StrictMode used by the app', async () => {
  render(
    <StrictMode>
      <FarmBoard round={round} />
    </StrictMode>,
  )
  await waitFor(() => expect(screen.getByText(/上榜啦/)).toBeTruthy())
  expect((screen.getByRole('button', { name: '刷新生存榜' }) as HTMLButtonElement).disabled).toBe(
    false,
  )
})

it('lets the player retry a failed submission without submitting on every render', async () => {
  vi.mocked(melodyRequest).mockImplementation(async (path) => {
    if (path === 'score') throw new Error('网络断开')
    return board
  })
  render(<FarmBoard round={round} />)
  await screen.findByText('网络断开')
  expect(vi.mocked(melodyRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(1)
  vi.mocked(melodyRequest).mockResolvedValue(board)
  fireEvent.click(screen.getByRole('button', { name: /重新上榜/ }))
  await screen.findByText(/上榜啦/)
  expect(vi.mocked(melodyRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(2)
})

it('submits a newly entered nickname only once', async () => {
  localStorage.clear()
  render(<FarmBoard round={round} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '新乐手' } })
  fireEvent.click(screen.getByRole('button', { name: '上榜 ↗' }))
  await screen.findByText(/上榜啦/)
  expect(vi.mocked(melodyRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(1)
})
