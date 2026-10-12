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
const scorePosts = () => vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')
/** Every request succeeds: used to prove a board refresh after a failure. */
const ok = async (_path: string, signal?: AbortSignal) => {
  await Promise.resolve()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return board
}
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
  await waitFor(() => expect(screen.getByText(/已上榜/)).toBeTruthy())
  expect((screen.getByRole('button', { name: '刷新生存榜' }) as HTMLButtonElement).disabled).toBe(
    false,
  )
})

it('ranks a signed-in player under the account name without asking for a nickname', async () => {
  const account = {
    user: { id: 'account_board_test', username: 'wqq' },
    openAccount: vi.fn(),
    refresh: vi.fn(),
  }
  render(
    <AccountContext.Provider value={account as never}>
      <FarmBoard round={round} />
    </AccountContext.Provider>,
  )
  await waitFor(() => expect(screen.getByText(/已上榜/)).toBeTruthy())
  // No nickname field is rendered at all for a signed-in player.
  expect(screen.queryByLabelText('昵称')).toBeNull()
  const posts = vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')
  expect(posts).toHaveLength(1)
  expect((posts[0][2] as { name: string }).name).toBe('wqq')
})

it('posts the score once when the effect is replayed after a cleanup', async () => {
  render(
    <StrictMode>
      <FarmBoard round={round} />
    </StrictMode>,
  )
  await waitFor(() => expect(screen.getByText(/已上榜/)).toBeTruthy())
  // A replayed mount must not resend: the server already stored this run.
  expect(vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(1)
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
  fireEvent.click(screen.getByRole('button', { name: '重新提交本局成绩到生存榜' }))
  await screen.findByText(/已上榜/)
  expect(vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(2)
})

it('submits a newly entered nickname only once', async () => {
  localStorage.clear()
  render(<FarmBoard round={round} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '新乐手' } })
  fireEvent.click(screen.getByRole('button', { name: '上榜' }))
  await screen.findByText(/已上榜/)
  expect(vi.mocked(farmRequest).mock.calls.filter(([path]) => path === 'score')).toHaveLength(1)
})

it('lets guests sign in after a finished run without submitting an anonymous score', async () => {
  activateAccount(null)
  const openAccount = vi.fn()
  render(
    <AccountContext
      value={{ user: null, openAccount, checking: false, setRunActive: () => {} } as never}
    >
      <FarmBoard round={round} />
    </AccountContext>,
  )
  // One way in: the duplicate register button is gone.
  const signIn = screen.getByRole('button', { name: '登录后可把本局成绩提交到生存榜' })
  expect(signIn.textContent).toBe('登录')
  expect(screen.getAllByRole('button')).toHaveLength(2)
  fireEvent.click(signIn)
  // The merged form takes no mode: one nickname field is the only way in.
  expect(openAccount).toHaveBeenCalledWith()
  await waitFor(() => expect(farmRequest).toHaveBeenCalled())
  expect(vi.mocked(farmRequest).mock.calls.some(([path]) => path === 'score')).toBe(false)
})

it('keeps the retry button when a failed upload is followed by a board refresh', async () => {
  vi.mocked(farmRequest).mockImplementation(async (path, signal) => {
    await Promise.resolve()
    if (path === 'score') throw new Error('网络断开')
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return board
  })
  render(<FarmBoard round={round} />)
  await screen.findByText('网络断开')
  expect(scorePosts()).toHaveLength(1)
  // Refreshing the board is a read: it must not swallow the failure of this
  // run, nor resend it behind the player's back.
  vi.mocked(farmRequest).mockImplementation(ok)
  fireEvent.click(screen.getByRole('button', { name: '刷新生存榜' }))
  await screen.findByText('等你上榜')
  expect(screen.getByText('网络断开')).toBeTruthy()
  const retry = screen.getByRole('button', { name: '重新提交本局成绩到生存榜' })
  expect(retry.textContent?.trim()).toBe('重新上榜')
  fireEvent.click(retry)
  await screen.findByText(/已上榜/)
  expect(scorePosts()).toHaveLength(2)
})

it('keeps the submitted state when a board refresh fails', async () => {
  let reads = 0
  vi.mocked(farmRequest).mockImplementation(async (path, signal) => {
    if (path === 'score') return board
    reads += 1
    await Promise.resolve()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (reads > 1) throw new Error('连不上，点刷新重试')
    return board
  })
  render(<FarmBoard round={round} />)
  await screen.findByText(/已上榜/)
  fireEvent.click(screen.getByRole('button', { name: '刷新生存榜' }))
  await screen.findByText('连不上，点刷新重试')
  // A board read that fails says nothing about the upload: the run is on it.
  expect(screen.getByText(/已上榜/)).toBeTruthy()
  expect(scorePosts()).toHaveLength(1)
})

it('keeps the upload error and its retry button after a board refresh', async () => {
  vi.mocked(farmRequest).mockImplementation(async (path, signal) => {
    await Promise.resolve()
    if (path === 'score') throw new Error('网络断开')
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return board
  })
  render(<FarmBoard round={round} />)
  await screen.findByText('网络断开')
  vi.mocked(farmRequest).mockImplementation(ok)
  fireEvent.click(screen.getByRole('button', { name: '刷新生存榜' }))
  await screen.findByText('等你上榜')
  expect(screen.getByText('网络断开')).toBeTruthy()
  expect(screen.getByRole('button', { name: '重新提交本局成绩到生存榜' })).toBeTruthy()
})

it('announces an in-flight upload', async () => {
  let release = () => {}
  const pending = new Promise<typeof board>((resolve) => {
    release = () => resolve(board)
  })
  vi.mocked(farmRequest).mockImplementation(async (path, signal) => {
    await Promise.resolve()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (path === 'score') return await pending
    return board
  })
  render(<FarmBoard round={round} />)
  const inFlight = await screen.findByText('正在上榜…')
  expect(inFlight.getAttribute('role')).toBe('status')
  release()
  await screen.findByText(/已上榜/)
})
