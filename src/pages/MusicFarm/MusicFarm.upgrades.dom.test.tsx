// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { farmBestKey } from '@/features/farm/monsters.mjs'
import { saveBestScore } from '@/utils/localScores'
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
vi.mock('@/utils/localScores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/localScores')>()
  return { loadBestScore: actual.loadBestScore, saveBestScore: vi.fn(actual.saveBestScore) }
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
  vi.mocked(saveBestScore).mockClear()
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
const start = async (strict = false) => {
  const tree = (
    <MemoryRouter initialEntries={['/farm?day=2026-10-04']}>
      <MusicFarm />
    </MemoryRouter>
  )
  render(strict ? <StrictMode>{tree}</StrictMode> : tree)
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

it('announces the card the player picked, not the last card of an automatic chain', async () => {
  const state = loadout()
  state.gear.range = MAX_GEAR_LEVEL - 1
  state.offered = ['range', 'heal']
  simulate(state)
  await start()
  fireEvent.click(screen.getByRole('button', { name: /共鸣音箱/ }))
  // The automatic heals behind the pick are not the player's choice and must
  // not announce themselves as one.
  expect(screen.queryByText(/已恢复满血/)).toBeNull()
  act(() => frame(1126))
  // The picked card leads the replay log, whatever follows it.
  expect(vi.mocked(finishFarm).mock.calls[0][2][0]).toEqual({ tick: 1, id: 'range' })
})

it('gives focus back to the button that opened a panel after the run ends', async () => {
  simulate({ ...loadout(), offered: [], score: 4321 })
  await start()
  act(() => frame(1126))
  expect(screen.getByText('演出落幕，再战一场！')).toBeTruthy()
  const opener = screen.getByRole('button', { name: '去永久强化 ↗' })
  opener.focus()
  fireEvent.click(opener)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '返回游戏' })))
  expect(document.activeElement).toBe(opener)
})

it('stores the daily best score once when a run ends', async () => {
  simulate({ ...loadout(), offered: [], score: 4321 })
  await start(true)
  act(() => frame(1126))
  expect(vi.mocked(finishFarm)).toHaveBeenCalledOnce()
  expect(vi.mocked(saveBestScore).mock.calls).toHaveLength(1)
  const [key, score] = vi.mocked(saveBestScore).mock.calls[0]
  expect(key).toBe(farmBestKey('2026-10-04'))
  expect(score).toBeGreaterThan(0)
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
