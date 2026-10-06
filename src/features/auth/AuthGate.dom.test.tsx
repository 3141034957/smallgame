// @vitest-environment jsdom
import { StrictMode, useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate'
import { AUTH_CHANGED_KEY, AUTH_EXPIRED_EVENT } from './client'
import { useAccount } from './context'
import {
  activeAccountId,
  activateAccount,
  accountStorage,
  exportGuestProgress,
} from '@/utils/accountStorage'
import {
  loadFarmProfile,
  awardFarmCoins,
  FARM_PROFILE_KEY,
  FARM_DEFAULT_CHARACTER,
} from '@/features/farm/characters'
import { testStorage } from '@/test/storage'
const user = { id: 'account_00000000-0000-4000-8000-000000000001', username: 'player_one' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let current: typeof user | null
let cloud: Record<string, string>
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  activateAccount(null)
  current = null
  cloud = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      if (String(url) === '/api/progress') {
        if (options?.method === 'POST') cloud = JSON.parse(options.body as string).data
        return json({ data: cloud, revision: 1 })
      }
      if (String(url).endsWith('/register')) {
        cloud = JSON.parse(options!.body as string).progress
        current = user
      }
      if (String(url).endsWith('/login')) current = user
      if (String(url).endsWith('/logout')) current = null
      return json({ user: current })
    }),
  )
})
afterEach(() => {
  cleanup()
  activateAccount(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function Game() {
  const account = useAccount()
  const [runs, setRuns] = useState(0)
  return (
    <div>
      <p>
        游戏账号 {account?.user?.id ?? 'guest'} 金币 {loadFarmProfile().coins}
      </p>
      <p>完成局数 {runs}</p>
      <button
        onClick={() => {
          awardFarmCoins(`guest_run_${runs}`, 1200)
          accountStorage.setItem('farm-career-v1', JSON.stringify({ runs: runs + 1 }))
          setRuns(runs + 1)
        }}
      >
        完成游客局
      </button>
      <button onClick={() => account?.openAccount('register')}>结算后注册</button>
    </div>
  )
}
const mount = () =>
  render(
    <StrictMode>
      <AuthGate>
        <Game />
      </AuthGate>
    </StrictMode>,
  )
async function fill(password = ' Aa1!"<> &+/% ') {
  fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'PLAYER_ONE' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } })
}
it('lets guests play first, then registers with every guest save and preserves the finished game screen', async () => {
  mount()
  expect(screen.getByText(/游戏账号 guest/)).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  accountStorage.setItem('farm-best-v9-boss-interval:2026-10-06', '24680')
  const guest = exportGuestProgress()
  fireEvent.click(screen.getByRole('button', { name: '结算后注册' }))
  const password = ' Aa1!"<> &+/% '
  await fill(password)
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'different' } })
  fireEvent.click(screen.getByRole('button', { name: '注册并保存进度' }))
  expect(screen.getByRole('alert').textContent).toContain('不一致')
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: '注册并保存进度' }))
  await screen.findByText(/游戏账号 account_.*金币 1200/)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('完成局数 1')).toBeTruthy()
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/register'))
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual({
    account: 'PLAYER_ONE',
    password,
    progress: guest,
  })
  expect(cloud).toEqual(guest)
  expect(accountStorage.getItem('farm-career-v1')).toBe('{"runs":1}')
  expect(accountStorage.getItem('farm-best-v9-boss-interval:2026-10-06')).toBe('24680')
  activateAccount(null)
  expect(loadFarmProfile().coins).toBe(0)
  activateAccount(user.id)
})
it('preserves guest progress after failed registration and prevents duplicate submissions', async () => {
  let finish: (response: Response) => void = () => {}
  const normal = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation((url, options) =>
    String(url).endsWith('/register')
      ? new Promise<Response>((resolve) => {
          finish = resolve
        })
      : normal(url, options),
  )
  mount()
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  fireEvent.click(screen.getByRole('button', { name: '结算后注册' }))
  await fill('Aa1!test')
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'Aa1!test' } })
  const form = screen.getByRole('button', { name: '注册并保存进度' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/register')),
  ).toHaveLength(1)
  await act(async () => finish(json({ error: '账号已注册' }, 409)))
  expect(screen.getByRole('alert').textContent).toContain('已注册')
  expect(activeAccountId()).toBeNull()
  expect(loadFarmProfile().coins).toBe(1200)
  fireEvent.click(screen.getByRole('button', { name: '返回游戏' }))
  expect(screen.getByText('完成局数 1')).toBeTruthy()
})
it('restores cloud progress after local storage was cleared and leaves the separate guest save intact on login', async () => {
  const view = mount()
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  cloud = {
    [FARM_PROFILE_KEY]: JSON.stringify({
      coins: 9000,
      owned: [FARM_DEFAULT_CHARACTER],
      selected: FARM_DEFAULT_CHARACTER,
      rewardedRuns: [],
    }),
  }
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  await fill('Aa1!test')
  fireEvent.click(screen.getByRole('button', { name: '登录并进入乐队' }))
  await screen.findByText(/游戏账号 account_.*金币 9000/)
  activateAccount(null)
  expect(loadFarmProfile().coins).toBe(1200)
  activateAccount(user.id)
  view.unmount()
  localStorage.clear()
  activateAccount(null)
  mount()
  await screen.findByText(/游戏账号 account_.*金币 9000/)
})
it('keeps guest play available even while the account service is offline', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'))
  mount()
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  expect(loadFarmProfile().coins).toBe(1200)
  expect(screen.getByText('完成局数 1')).toBeTruthy()
})
it('returns to a clean guest scope after session expiry and never leaks the account wallet', async () => {
  current = user
  cloud = { [FARM_PROFILE_KEY]: '{"coins":9000}' }
  mount()
  await screen.findByText(/游戏账号 account_/)
  current = null
  await act(async () => window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)))
  await screen.findByText(/游戏账号 guest 金币 0/)
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  expect(loadFarmProfile().coins).toBe(1200)
  activateAccount(user.id)
  expect(loadFarmProfile().coins).toBe(9000)
  activateAccount(null)
})
it('keeps an account on failed logout and only starts guest mode after successful logout', async () => {
  current = user
  mount()
  await screen.findByRole('button', { name: '退出登录' })
  const normal = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation((url, options) =>
    String(url).endsWith('/logout')
      ? Promise.resolve(json({ error: '请重试' }, 503))
      : normal(url, options),
  )
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByRole('alert')
  expect(activeAccountId()).toBe(user.id)
  vi.mocked(fetch).mockImplementation(normal)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '退出登录' }).hasAttribute('disabled')).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByText(/游戏账号 guest/)
  expect(activeAccountId()).toBeNull()
})
it('unmounts the previous owner before activating another account storage scope', async () => {
  const next = { id: 'account_00000000-0000-4000-8000-000000000002', username: 'player_two' }
  const WriteOnLeave = () => {
    const owner = useAccount()?.user?.id ?? 'guest'
    useEffect(() => () => accountStorage.setItem('last-owner', owner), [owner])
    return <div>正在玩 {owner}</div>
  }
  current = user
  render(
    <AuthGate>
      <WriteOnLeave />
    </AuthGate>,
  )
  await screen.findByText(`正在玩 ${user.id}`)
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url) === '/api/progress' ? json({ data: {}, revision: 1 }) : json({ user: next }),
  )
  await act(async () =>
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_CHANGED_KEY })),
  )
  await screen.findByText(`正在玩 ${next.id}`)
  expect(accountStorage.getItem('last-owner')).toBeNull()
  activateAccount(user.id)
  expect(accountStorage.getItem('last-owner')).toBe(user.id)
  activateAccount(next.id)
})
