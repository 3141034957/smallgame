// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { AuthGate } from '@/features/auth/AuthGate'
import { AUTH_CHANGED_KEY } from '@/features/auth/client'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { stepFarm } from '@/features/farm/rules.mjs'
import { activateAccount, activeAccountId } from '@/utils/accountStorage'
import { testStorage } from '@/test/storage'

vi.mock('./FarmBoard', () => ({ FarmBoard: () => <div>测试总榜</div> }))
vi.mock('./render', () => ({ drawFarm: vi.fn() }))
vi.mock('./characterSprite', () => ({
  loadFarmCharacterSprite: async () => document.createElement('canvas'),
}))
vi.mock('@/features/farm/rules.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/farm/rules.mjs')>()
  return { ...actual, stepFarm: vi.fn(actual.stepFarm) }
})

const user = { id: 'account_00000000-0000-4000-8000-000000000001', username: 'player_one' }
const FORM = '输入昵称，进入乐队'
let current: typeof user | null
let frame: FrameRequestCallback
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
beforeEach(() => {
  current = null
  vi.stubGlobal('localStorage', testStorage())
  localStorage.setItem(FARM_HELP_SEEN_KEY, '1')
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.stubGlobal(
    'fetch',
    // The cloud save carries the help flag, so the account scope does not
    // reopen the rules dialog over the run.
    vi.fn(async (url: string) =>
      String(url) === '/api/progress'
        ? json({ data: { [FARM_HELP_SEEN_KEY]: '1' }, revision: 1 })
        : json({ user: current }),
    ),
  )
  vi.mocked(stepFarm).mockClear()
})
afterEach(() => {
  cleanup()
  activateAccount(null)
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  vi.mocked(stepFarm).mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
// Standing still: the band dies on the second tick.
const die = () => {
  vi.mocked(stepFarm).mockImplementationOnce((previous) => ({
    state: { ...previous, tick: previous.tick + 1 },
    events: [],
  }))
  vi.mocked(stepFarm).mockImplementation((previous) => ({
    state: { ...previous, tick: previous.tick + 1, hp: 0, offered: [] },
    events: [],
  }))
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/farm?day=2026-10-04']}>
      <AuthGate>
        <MusicFarm />
      </AuthGate>
    </MemoryRouter>,
  )
const startButton = () => screen.getByRole('button', { name: '开始无限模式' }) as HTMLButtonElement
const finishRun = async () => {
  // The identity check is still running right after mount and the start button
  // waits for it, so the click has to wait too.
  await waitFor(() => expect(startButton().disabled).toBe(false))
  await act(async () => fireEvent.click(startButton()))
  // A 200 ms gap between two frames is two simulation ticks: the run ends.
  act(() => frame(1000))
  act(() => frame(1200))
}
it('lets a guest keep playing after a run instead of forcing a sign-in', async () => {
  die()
  mount()
  await finishRun()
  expect(screen.getByText('演出落幕')).toBeTruthy()
  // Nothing is pushed over the recap: signing in is the player's own move.
  expect(screen.queryByText(FORM)).toBeNull()
  expect(screen.queryByRole('dialog', { name: '乐队账号登录' })).toBeNull()
  // The way in is still there, and the run can simply go on.
  expect(screen.getByRole('button', { name: '输入昵称登录并同步进度' })).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '再来一局' })))
  expect(screen.getByRole('button', { name: '开始无限模式' })).toBeTruthy()
})
it('holds the start button until the identity check answers', async () => {
  let release: (response: Response) => void = () => {}
  vi.mocked(fetch).mockImplementation((url) =>
    String(url).endsWith('/session')
      ? new Promise<Response>((resolve) => {
          release = resolve
        })
      : Promise.resolve(json({ data: {}, revision: 1 })),
  )
  mount()
  // An unknown identity must not own a run: the button says why it is off.
  expect(startButton().disabled).toBe(true)
  expect(screen.getByText('检查登录中…')).toBeTruthy()
  await act(async () => release(json({ user: null })))
  await waitFor(() => expect(startButton().disabled).toBe(false))
  expect(screen.queryByText('检查登录中…')).toBeNull()
})
it('lets a guest start even when the account service cannot be reached', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'))
  mount()
  // A failure answers the question too: the gate opens for guest play.
  await waitFor(() => expect(startButton().disabled).toBe(false))
  await act(async () => fireEvent.click(startButton()))
  expect(screen.getByRole('button', { name: '暂停游戏' })).toBeTruthy()
})
it('parks an identity switch behind a live run and applies it once the run is over', async () => {
  // The band survives every tick: the round stays live until it is settled.
  vi.mocked(stepFarm).mockImplementation((previous) => ({
    state: { ...previous, tick: previous.tick + 1, offered: [] },
    events: [],
  }))
  mount()
  await waitFor(() => expect(startButton().disabled).toBe(false))
  await act(async () => fireEvent.click(startButton()))
  act(() => frame(1000))
  act(() => frame(1200))
  expect(screen.getByRole('button', { name: '暂停游戏' })).toBeTruthy()
  // Slow network: the session finally answers, and it belongs to someone else.
  current = user
  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_CHANGED_KEY }))
  })
  // The live run is not thrown away, and its score is not written into the
  // other account's storage.
  expect(screen.getByRole('button', { name: '暂停游戏' })).toBeTruthy()
  expect(screen.queryByText(`♫ ${user.username}`)).toBeNull()
  expect(screen.getByText('本局后切换')).toBeTruthy()
  expect(activeAccountId()).toBeNull()
  // Settling keeps the recap: the score and the board entry survive.
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '暂停游戏' })))
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: '结束本局并结算成绩，提交到生存排行榜' })),
  )
  expect(screen.getByText('演出落幕')).toBeTruthy()
  expect(screen.queryByText(`♫ ${user.username}`)).toBeNull()
  expect(activeAccountId()).toBeNull()
  // Going back to the start screen is the player's own move, and only then
  // does the parked identity take over.
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '再来一局' })))
  await waitFor(() => expect(screen.getByText(`♫ ${user.username}`)).toBeTruthy())
  expect(activeAccountId()).toBe(user.id)
})
it('never asks a signed-in player for a nickname after a run', async () => {
  current = user
  die()
  mount()
  // The account scope swaps the game out and back before the run can start.
  await screen.findByText(`♫ ${user.username}`)
  await finishRun()
  expect(screen.getByText('演出落幕')).toBeTruthy()
  expect(screen.queryByText(FORM)).toBeNull()
  expect(screen.queryByRole('dialog', { name: '乐队账号登录' })).toBeNull()
})
