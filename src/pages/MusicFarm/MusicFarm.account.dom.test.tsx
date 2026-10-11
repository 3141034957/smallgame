// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { AuthGate } from '@/features/auth/AuthGate'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { stepFarm } from '@/features/farm/rules.mjs'
import { activateAccount } from '@/utils/accountStorage'
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
const finishRun = async () => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '开始无限模式' })))
  // A 200 ms gap between two frames is two simulation ticks: the run ends.
  act(() => frame(1000))
  act(() => frame(1200))
}
it('asks a guest for a nickname the moment the run ends', async () => {
  die()
  mount()
  await finishRun()
  expect(screen.getByText('演出落幕')).toBeTruthy()
  // The finished run is the offer: a nickname is all it takes to keep playing.
  await screen.findByText(FORM)
  expect(screen.getByLabelText('昵称')).toBeTruthy()
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
