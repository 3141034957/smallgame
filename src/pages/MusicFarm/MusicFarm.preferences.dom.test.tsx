// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { drawFarm } from './render'
import { stepFarm } from '@/features/farm/rules.mjs'
import { loadFarmSettings, saveFarmSettings } from '@/features/farm/settings'
import { ACCOUNT_SWITCH_EVENT } from '@/features/auth/context'
import { testStorage } from '@/test/storage'

const sound = vi.hoisted(() => ({
  prepare: vi.fn(async () => true),
  setMuted: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
  playLane: vi.fn(),
  accompany: vi.fn(),
}))
vi.mock('@/features/farm/audio', () => ({
  FarmAudio: class {
    prepare = sound.prepare
    setMuted = sound.setMuted
    stop = sound.stop
    dispose = sound.dispose
    playLane = sound.playLane
    accompany = sound.accompany
  },
}))
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
let motion: {
  matches: boolean
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', (query: string) =>
    query.includes('prefers-reduced-motion') ? motion : { matches: false },
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.mocked(stepFarm).mockImplementation((previous) => ({
    state: { ...previous, tick: previous.tick + 1, offered: [] },
    events: [],
  }))
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  vi.mocked(stepFarm).mockReset()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const mount = () =>
  render(
    <MemoryRouter>
      <MusicFarm />
    </MemoryRouter>,
  )
const start = async () => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '开始无限模式' })))
  act(() => frame(1000))
  act(() => frame(1120))
}
const latestPose = () => vi.mocked(drawFarm).mock.calls.at(-1)?.[6]

it('restores mute before audio preparation and keeps it when effects change', async () => {
  saveFarmSettings({ muted: true, effects: false })
  const first = mount()
  expect(screen.getByRole('button', { name: '开启声音' })).toBeTruthy()
  expect(sound.setMuted).toHaveBeenLastCalledWith(true)
  await start()
  expect(latestPose()?.simple).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '暂停游戏' }))
  fireEvent.click(screen.getByRole('button', { name: '开启特效' }))
  expect(loadFarmSettings()).toEqual({ muted: true, effects: true })
  first.unmount()
  mount()
  expect(screen.getByRole('button', { name: '开启声音' })).toBeTruthy()
  expect(sound.setMuted).toHaveBeenLastCalledWith(true)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '开启声音' })))
  expect(loadFarmSettings()).toEqual({ muted: false, effects: true })
})

it('applies reloaded account preferences to the renderer and audio together', async () => {
  mount()
  await start()
  saveFarmSettings({ muted: true, effects: false })
  act(() => window.dispatchEvent(new Event(ACCOUNT_SWITCH_EVENT)))
  act(() => frame(1240))
  expect(latestPose()?.simple).toBe(true)
  expect(sound.setMuted).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: '开启声音' })).toBeTruthy()
})

it('tracks reduced-motion changes without overwriting the effects preference', async () => {
  motion.matches = true
  mount()
  await start()
  expect(latestPose()?.reducedMotion).toBe(true)
  expect(latestPose()?.simple).toBe(false)
  motion.matches = false
  act(() => motion.addEventListener.mock.calls[0][1]())
  act(() => frame(1240))
  expect(latestPose()?.reducedMotion).toBe(false)
  expect(loadFarmSettings().effects).toBe(true)
  cleanup()
  expect(motion.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
})

it('warns at 30 percent health even after max-health growth', async () => {
  vi.mocked(stepFarm).mockImplementation((previous) => ({
    state: { ...previous, tick: previous.tick + 1, hp: 60, maxHp: 200, offered: [] },
    events: [],
  }))
  mount()
  await start()
  const health = screen.getByRole('progressbar', { name: '生命值' })
  expect(health.getAttribute('aria-valuenow')).toBe('60')
  expect(health.parentElement?.classList.contains('is-low')).toBe(true)
})

it('traps focus through the active guide panel and skips inactive tabs', async () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: '查看进化配方' }))
  const back = screen.getByRole('button', { name: '关闭帮助并返回' })
  const panel = screen.getByRole('tabpanel')
  act(() => panel.focus())
  fireEvent.keyDown(panel, { key: 'Tab' })
  expect(document.activeElement).toBe(back)
  fireEvent.keyDown(back, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(panel)
})
