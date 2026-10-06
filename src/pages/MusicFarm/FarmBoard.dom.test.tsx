// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FarmBoard } from './FarmBoard'
import { farmRequest } from '@/features/farm/leaderboard'
import type { FarmRound } from '@/features/farm/rules.mjs'
import { NICKNAME_STORAGE_KEY } from '@/utils/playerIdentity'
import { activateAccount, installAccountSave } from '@/utils/accountStorage'
import { AccountContext } from '@/features/auth/context'
import { testStorage } from '@/test/storage'

vi.mock('@/features/farm/leaderboard', () => ({ farmRequest: vi.fn() }))
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
  activateAccount('account_board_test')
  installAccountSave('account_board_test', {
    data: { [NICKNAME_STORAGE_KEY]: '小乐手' },
    revision: 1,
    dirty: false,
  })
  vi.mocked(farmRequest).mockImplementation(async (_path, signal) => {
    await Promise.resolve()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return board
  })
})
afterEach(() => {
  cleanup()
  activateAccount(null)
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
  vi.mocked(farmRequest).mockImplementation(async (path) => {
    if (path === 'score') throw new Error('网络断开')
    return board
  })
  render(<FarmBoard round={round} />)
  await screen.findByText('网络断开')
  expect(vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(1)
  vi.mocked(farmRequest).mockResolvedValue(board)
  fireEvent.click(screen.getByRole('button', { name: /重新上榜/ }))
  await screen.findByText(/上榜啦/)
  expect(vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(2)
})

it('submits a newly entered nickname only once', async () => {
  localStorage.clear()
  render(<FarmBoard round={round} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '新乐手' } })
  fireEvent.click(screen.getByRole('button', { name: '上榜 ↗' }))
  await screen.findByText(/上榜啦/)
  expect(vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(1)
})

it('lets guests register after a finished run without submitting an anonymous score', async () => {
  activateAccount(null)
  const openAccount = vi.fn()
  render(
    <AccountContext value={{ user: null, openAccount }}>
      <FarmBoard round={round} />
    </AccountContext>,
  )
  fireEvent.click(screen.getByRole('button', { name: '注册并保存本局进度' }))
  expect(openAccount).toHaveBeenCalledWith('register')
  await waitFor(() => expect(farmRequest).toHaveBeenCalled())
  expect(vi.mocked(farmRequest).mock.calls.some(([path]) => path === 'score')).toBe(false)
})
