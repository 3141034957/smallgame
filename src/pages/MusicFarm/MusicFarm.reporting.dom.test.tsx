// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { AccountContext, type AccountContextValue } from '@/features/auth/context'
import { FarmAudio } from '@/features/farm/audio'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { testStorage } from '@/test/storage'
import { stepFarm } from '@/features/farm/rules.mjs'

vi.mock('./FarmBoard', () => ({ FarmBoard: () => <div>测试总榜</div> }))
vi.mock('./render', () => ({ drawFarm: vi.fn() }))
vi.mock('./characterSprite', () => ({
  loadFarmCharacterSprite: async () => document.createElement('canvas'),
}))
vi.mock('@/features/farm/rules.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/farm/rules.mjs')>()
  return { ...actual, stepFarm: vi.fn(actual.stepFarm) }
})

let frame: FrameRequestCallback
const request = vi.fn()
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  localStorage.setItem(FARM_HELP_SEEN_KEY, '1')
  request.mockReset().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', request)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(FarmAudio.prototype, 'prepare').mockResolvedValue(true)
  vi.spyOn(window.history, 'back').mockImplementation(() => {})
  vi.mocked(stepFarm).mockImplementation((previous) => ({
    state: { ...previous, tick: previous.tick + 1, offered: [] },
    events: [],
  }))
})
afterEach(() => {
  cleanup()
  vi.mocked(stepFarm).mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const mount = (account: AccountContextValue | null = null) =>
  render(
    <MemoryRouter initialEntries={['/farm?day=2026-10-04']}>
      <AccountContext.Provider value={account}>
        <MusicFarm />
      </AccountContext.Provider>
    </MemoryRouter>,
  )
const click = async (name: string) => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name })))
}
const reportedIds = () => request.mock.calls.map(([, options]) => JSON.parse(options.body).runId)

it.each([false, true])(
  'reports an actual start once for signed-in=%s, guarding a double click',
  async (signedIn) => {
    mount({
      user: signedIn ? { id: 'account_test', username: 'player' } : null,
      checking: false,
      openAccount: vi.fn(),
      setRunActive: vi.fn(),
    })
    expect(request).not.toHaveBeenCalled()
    const start = screen.getByRole('button', { name: '开始无限模式' })
    // Both events arrive before React replaces the ready screen.
    await act(async () => {
      fireEvent.click(start)
      fireEvent.click(start)
    })
    expect(request).toHaveBeenCalledOnce()
    expect(reportedIds()[0]).toMatch(/^farm_\d{13}_\d{1,10}_\d{1,10}$/)
    expect(FarmAudio.prototype.prepare).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '暂停游戏' })).toBeTruthy()
  },
)

it('does not report while identity verification still prevents play', async () => {
  mount({ user: null, checking: true, openAccount: vi.fn(), setRunActive: vi.fn() })
  await click('开始无限模式')
  expect(request).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '暂停游戏' })).toBeNull()
})

it('ignores pause, resume and return to ready, then gives the next start a new ID', async () => {
  mount()
  await click('开始无限模式')
  const first = reportedIds()[0]
  await click('暂停游戏')
  await click('继续战斗')
  expect(request).toHaveBeenCalledOnce()
  await click('重新开始本局')
  await click('确认重新开始本局')
  expect(screen.getByRole('button', { name: '开始无限模式' })).toBeTruthy()
  expect(request).toHaveBeenCalledOnce()
  await click('开始无限模式')
  expect(request).toHaveBeenCalledTimes(2)
  expect(reportedIds()[1]).not.toBe(first)
})

it.each(['pending', 'offline'])(
  'keeps audio and gameplay running when reporting is %s',
  async (failure) => {
    if (failure === 'pending') request.mockImplementation(() => new Promise(() => {}))
    else request.mockRejectedValue(new Error('offline'))
    mount()
    await click('开始无限模式')
    act(() => frame(1000))
    act(() => frame(1120))
    expect(stepFarm).toHaveBeenCalled()
    expect(FarmAudio.prototype.prepare).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '暂停游戏' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(request).toHaveBeenCalledTimes(failure === 'pending' ? 1 : 2)
  },
)
