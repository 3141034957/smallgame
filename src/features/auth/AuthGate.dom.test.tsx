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
const SUBMIT = '用这个昵称进入乐队并同步进度'
let current: typeof user | null
let cloud: Record<string, string>
// Nicknames that already own a cloud save: entering one must not overwrite it.
let claimed: Set<string>
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  activateAccount(null)
  current = null
  cloud = {}
  claimed = new Set()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      if (String(url) === '/api/progress') {
        if (options?.method === 'POST') cloud = JSON.parse(options.body as string).data
        return json({ data: cloud, revision: 1 })
      }
      if (String(url).endsWith('/login')) {
        const { account, progress } = JSON.parse(options!.body as string)
        // The server adopts the guest progress only for a nickname nobody claimed.
        if (!claimed.has(String(account).toLowerCase())) {
          claimed.add(String(account).toLowerCase())
          cloud = progress
        }
        current = user
      }
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
      <button onClick={() => account?.openAccount('login')}>结算后进入乐队</button>
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
const fillNickname = (value: string) =>
  fireEvent.change(screen.getByLabelText('昵称'), { target: { value } })
it('lets guests play first, then enters with a nickname and hands every guest save to the cloud', async () => {
  mount()
  expect(screen.getByText(/游戏账号 guest/)).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  accountStorage.setItem('farm-best-v9-boss-interval:2026-10-06', '24680')
  const guest = exportGuestProgress()
  fireEvent.click(screen.getByRole('button', { name: '结算后进入乐队' }))
  fillNickname('PLAYER_ONE')
  const submit = screen.getByRole('button', { name: SUBMIT })
  // The button stays short: "进入乐队" on screen, full wording only for screen readers.
  expect(submit.textContent).toBe('进入乐队')
  fireEvent.click(submit)
  await screen.findByText(/游戏账号 account_.*金币 1200/)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('已进入，进度已同步')).toBeTruthy()
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/login'))
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual({
    account: 'PLAYER_ONE',
    progress: guest,
  })
  expect(cloud).toEqual(guest)
  expect(accountStorage.getItem('farm-career-v1')).toBe('{"runs":1}')
  expect(accountStorage.getItem('farm-best-v9-boss-interval:2026-10-06')).toBe('24680')
  activateAccount(null)
  expect(loadFarmProfile().coins).toBe(1200)
  activateAccount(user.id)
})
it('offers one nickname-only way in and reports a bad nickname without calling the service', async () => {
  mount()
  expect(screen.queryByRole('button', { name: '注册账号保存进度' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '输入昵称登录并同步进度' }))
  expect(screen.getByText('输入昵称，进入乐队')).toBeTruthy()
  expect(screen.getByText(/3–32 位字母、数字或 _/)).toBeTruthy()
  expect(screen.getByText(/不设密码，换设备输入同一昵称即可继续/)).toBeTruthy()
  fillNickname('ab')
  fireEvent.click(screen.getByRole('button', { name: SUBMIT }))
  expect(screen.getByRole('alert').textContent).toBe('昵称格式不对')
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/login'))).toBe(false)
  fillNickname('PLAYER_ONE')
  fireEvent.click(screen.getByRole('button', { name: SUBMIT }))
  await screen.findByText(/游戏账号 account_/)
})
it('sends the guest progress once and keeps it when the service refuses the request', async () => {
  let finish: (response: Response) => void = () => {}
  const normal = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation((url, options) =>
    String(url).endsWith('/login')
      ? new Promise<Response>((resolve) => {
          finish = resolve
        })
      : normal(url, options),
  )
  mount()
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  fireEvent.click(screen.getByRole('button', { name: '结算后进入乐队' }))
  fillNickname('PLAYER_ONE')
  const form = screen.getByRole('button', { name: SUBMIT }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/login')),
  ).toHaveLength(1)
  await act(async () => finish(json({ error: '尝试次数过多，请 15 分钟后重试。' }, 429)))
  expect(screen.getByRole('alert').textContent).toContain('尝试次数过多')
  expect(activeAccountId()).toBeNull()
  expect(loadFarmProfile().coins).toBe(1200)
  fireEvent.click(screen.getByRole('button', { name: '返回游戏' }))
  expect(screen.getByText('完成局数 1')).toBeTruthy()
})
it('enters an existing nickname without overwriting its cloud save, and restores it on a new device', async () => {
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
  claimed.add('player_one')
  fireEvent.click(screen.getByRole('button', { name: '输入昵称登录并同步进度' }))
  fillNickname('PLAYER_ONE')
  fireEvent.click(screen.getByRole('button', { name: SUBMIT }))
  await screen.findByText(/游戏账号 account_.*金币 9000/)
  const sent = JSON.parse(
    vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/login'))![1]!.body as string,
  )
  // The guest snapshot is always uploaded; the server ignores it for a taken name.
  expect(sent.progress[FARM_PROFILE_KEY]).toContain('1200')
  expect(cloud[FARM_PROFILE_KEY]).toContain('9000')
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
it('clears the conflict banner when the session switches to another account', async () => {
  const other = { id: 'account_00000000-0000-4000-8000-000000000002', username: 'player_two' }
  let conflicting = true
  current = user
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (String(url) === '/api/progress') {
      if (options?.method === 'POST' && conflicting) return json({ error: 'conflict' }, 409)
      return json({ data: cloud, revision: 1 })
    }
    return json({ user: current })
  })
  mount()
  await screen.findByText('♫ player_one')
  fireEvent.click(screen.getByRole('button', { name: '完成游客局' }))
  await waitFor(() => expect(screen.getByText(/云端有更新/)).toBeTruthy())
  conflicting = false
  current = other
  await act(async () =>
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_CHANGED_KEY })),
  )
  await screen.findByText('♫ player_two')
  expect(screen.queryByText(/云端有更新/)).toBeNull()
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
