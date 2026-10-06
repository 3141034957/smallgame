// @vitest-environment jsdom
import { StrictMode, useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate'
import { AUTH_EXPIRED_EVENT } from './client'
import { activeAccountId, activateAccount, accountStorage } from '@/utils/accountStorage'
import { AUTH_CHANGED_KEY } from './client'
import {
  loadFarmProfile,
  FARM_PROFILE_KEY,
  FARM_DEFAULT_CHARACTER,
} from '@/features/farm/characters'
import { testStorage } from '@/test/storage'
const user = { id: 'account_00000000-0000-4000-8000-000000000001', username: 'player_one' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  activateAccount(null)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ user: null })),
  )
})
afterEach(() => {
  cleanup()
  activateAccount(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const Game = () => (
  <div>
    游戏账号 {activeAccountId()} 金币 {loadFarmProfile().coins}
  </div>
)
const mount = () =>
  render(
    <StrictMode>
      <AuthGate>
        <Game />
      </AuthGate>
    </StrictMode>,
  )
async function fill(password = ' Aa1!"<> &+/% ') {
  await screen.findByRole('button', { name: '登录并进入乐队' })
  fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'PLAYER_ONE' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } })
}
it('protects entry, supports registration confirmation and preserves exact password characters', async () => {
  vi.mocked(fetch).mockImplementation(async (url) =>
    json({ user: String(url).endsWith('/register') ? user : null }),
  )
  localStorage.setItem(
    FARM_PROFILE_KEY,
    JSON.stringify({
      coins: 12000,
      owned: [FARM_DEFAULT_CHARACTER],
      selected: FARM_DEFAULT_CHARACTER,
      rewardedRuns: [],
    }),
  )
  mount()
  await fill()
  expect(screen.queryByText(/游戏账号/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '注册账号' }))
  const password = ' Aa1!"<> &+/% '
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'different' } })
  fireEvent.click(screen.getByRole('button', { name: '注册并进入乐队' }))
  expect(screen.getByRole('alert').textContent).toContain('不一致')
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: '注册并进入乐队' }))
  expect(await screen.findByText(/游戏账号.*金币 12000/)).toBeTruthy()
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/register'))
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ account: 'PLAYER_ONE', password })
  expect(localStorage.getItem('echo-auth-password')).toBeNull()
})
it('makes duplicate submission one request and restores the account on refresh', async () => {
  let resolveLogin: (response: Response) => void = () => {}
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url).endsWith('/login')
      ? new Promise<Response>((resolve) => {
          resolveLogin = resolve
        })
      : json({ user: null }),
  )
  const view = mount()
  await fill()
  const form = screen.getByRole('button', { name: '登录并进入乐队' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/login')),
  ).toHaveLength(1)
  await act(async () => {
    resolveLogin(json({ user }))
  })
  expect(screen.getByText(/游戏账号/)).toBeTruthy()
  view.unmount()
  vi.mocked(fetch).mockImplementation(async () => json({ user }))
  mount()
  expect(await screen.findByText(/游戏账号/)).toBeTruthy()
  expect(screen.getByRole('button', { name: '退出登录' })).toBeTruthy()
})
it('unmounts the game after an invalidated session and prevents signed-out save writes', async () => {
  vi.mocked(fetch).mockImplementation(async () => json({ user }))
  mount()
  await screen.findByText(/游戏账号/)
  vi.mocked(fetch).mockImplementation(async () => json({ error: '已失效' }, 401))
  await act(async () => {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  })
  await screen.findByRole('button', { name: '登录并进入乐队' })
  expect(screen.queryByText(/游戏账号/)).toBeNull()
  expect(activeAccountId()).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('失效')
})
it('does not permit anonymous play after a network error and supports reconnecting', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'))
  mount()
  await screen.findByRole('alert')
  expect(screen.queryByText(/游戏账号/)).toBeNull()
  vi.mocked(fetch).mockImplementation(async () => json({ user: null }))
  fireEvent.click(screen.getByRole('button', { name: '重新连接' }))
  await screen.findByRole('button', { name: '登录并进入乐队' })
})
it('keeps the game on a failed logout and leaves it only after the server revokes the session', async () => {
  vi.mocked(fetch).mockImplementation(async () => json({ user }))
  mount()
  await screen.findByText(/游戏账号/)
  vi.mocked(fetch).mockImplementation(async () => json({ error: '请重试' }, 503))
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByRole('alert')
  expect(screen.getByText(/游戏账号/)).toBeTruthy()
  vi.mocked(fetch).mockImplementation(async () => json({ user: null }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '退出登录' }).hasAttribute('disabled')).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByRole('button', { name: '登录并进入乐队' })
  expect(activeAccountId()).toBeNull()
})

it('unmounts the previous game before activating another account storage scope', async () => {
  const next = { id: 'account_00000000-0000-4000-8000-000000000002', username: 'player_two' }
  const WriteOnLeave = () => {
    const owner = activeAccountId()
    useEffect(() => () => accountStorage.setItem('last-owner', owner!), [owner])
    return <div>正在玩 {owner}</div>
  }
  vi.mocked(fetch).mockImplementation(async () => json({ user }))
  render(
    <AuthGate>
      <WriteOnLeave />
    </AuthGate>,
  )
  await screen.findByText(`正在玩 ${user.id}`)
  vi.mocked(fetch).mockImplementation(async () => json({ user: next }))
  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_CHANGED_KEY }))
  })
  await screen.findByText(`正在玩 ${next.id}`)
  expect(accountStorage.getItem('last-owner')).toBeNull()
  activateAccount(user.id)
  expect(accountStorage.getItem('last-owner')).toBe(user.id)
  activateAccount(next.id)
})
