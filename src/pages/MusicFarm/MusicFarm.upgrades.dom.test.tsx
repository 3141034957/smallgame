// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { testStorage } from '@/test/storage'
import {
  createFarm,
  farmXpThreshold,
  finishFarm,
  MAX_GEAR_LEVEL,
  stepFarm,
  TALENTS,
} from '@/features/farm/rules.mjs'
import type { FarmState } from '@/features/farm/rules.mjs'

vi.mock('./FarmBoard', () => ({ FarmBoard: () => <div>测试总榜</div> }))
vi.mock('./render', () => ({ drawFarm: vi.fn() }))
vi.mock('./characterSprite', () => ({
  loadFarmCharacterSprite: async () => document.createElement('canvas'),
}))
vi.mock('@/features/farm/rules.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/farm/rules.mjs')>()
  return { ...actual, stepFarm: vi.fn(actual.stepFarm), finishFarm: vi.fn(actual.finishFarm) }
})

let frame: FrameRequestCallback
beforeEach(() => {
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
  vi.mocked(stepFarm).mockClear()
  vi.mocked(finishFarm).mockClear()
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  vi.mocked(stepFarm).mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const loadout = () => {
  const state = createFarm('2026-10-04')
  for (const kind of ['weapon', 'chip'])
    for (const talent of TALENTS.filter((item) => item.kind === kind).slice(0, 5))
      state.gear[talent.id] = MAX_GEAR_LEVEL
  return { ...state, level: 50, hp: 7, xp: farmXpThreshold(53) }
}
const simulate = (offered: FarmState) => {
  vi.mocked(stepFarm).mockImplementationOnce((previous) => ({
    state: { ...offered, tick: previous.tick + 1 },
    events: [],
  }))
  vi.mocked(stepFarm).mockImplementation((previous) => ({
    state: { ...previous, tick: previous.tick + 1, hp: 0, offered: [] },
    events: [],
  }))
}
const start = async () => {
  render(
    <MemoryRouter initialEntries={['/farm?day=2026-10-04']}>
      <MusicFarm />
    </MemoryRouter>,
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /开始玩/ })))
  act(() => frame(1000))
  act(() => frame(1063))
}
const expectRecorded = (ids: string[]) => {
  act(() => frame(1126))
  expect(vi.mocked(finishFarm)).toHaveBeenCalledOnce()
  const [state, frames, choices] = vi.mocked(finishFarm).mock.calls[0]
  expect(state.level).toBe(53)
  expect(frames).toHaveLength(2)
  expect(choices).toEqual(ids.map((id) => ({ tick: 1, id })))
}

it('automatically heals and continues play without mounting a single-option dialog', async () => {
  simulate({ ...loadout(), offered: ['heal'] })
  await start()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('progressbar', { name: '生命值' }).getAttribute('aria-valuenow')).toBe(
    '100',
  )
  expect(screen.getByText('Lv.54')).toBeTruthy()
  expectRecorded(['heal', 'heal', 'heal'])
})

it('waits for a manual choice when there are multiple options, then skips following sole offers', async () => {
  const state = loadout()
  state.gear.range = MAX_GEAR_LEVEL - 1
  state.offered = ['range', 'heal']
  simulate(state)
  await start()
  expect(screen.getByRole('dialog')).toBeTruthy()
  act(() => frame(1126))
  expect(vi.mocked(stepFarm)).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /共鸣音箱/ }))
  expect(screen.queryByRole('dialog')).toBeNull()
  // The time spent choosing must not turn into extra simulation ticks.
  act(() => frame(1189))
  expect(vi.mocked(finishFarm)).toHaveBeenCalledOnce()
  expect(vi.mocked(finishFarm).mock.calls[0][2]).toEqual(
    ['range', 'heal', 'heal'].map((id) => ({ tick: 1, id })),
  )
})
