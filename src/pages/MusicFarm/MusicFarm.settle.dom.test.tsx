// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { saveBestScore } from '@/utils/localScores'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { testStorage } from '@/test/storage'
import { finishFarm, stepFarm } from '@/features/farm/rules.mjs'
import {
  FARM_MAX_SUBMIT_FRAMES,
  FARM_SUBMIT_WARN_FRAMES,
  FARM_TOO_LONG_MESSAGE,
} from '@/features/farm/share'

// The real board is the submission: rendering the round it was handed proves
// the settle travelled the same path as a death.
vi.mock('./FarmBoard', () => ({
  FarmBoard: ({ round }: { round?: { score: number } | null }) => (
    <div>测试总榜{round ? `·提交 ${round.score} 分` : '·未提交'}</div>
  ),
}))
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
// A live run parked on one tick: the band survives, so only the clock moves.
const surviveAt = (tick: number, score = 0) => {
  vi.mocked(stepFarm).mockImplementation((previous) => ({
    state: { ...previous, tick, score, offered: [] },
    events: [],
  }))
}
const start = async () => {
  render(
    <MemoryRouter initialEntries={['/farm?day=2026-10-04']}>
      <MusicFarm />
    </MemoryRouter>,
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '开始无限模式' })))
  // The HUD republishes at most every 100 ms, so a third frame is the one
  // that puts the mocked tick on screen.
  act(() => frame(1000))
  act(() => frame(1063))
  act(() => frame(1189))
}
const pause = async () =>
  act(async () => fireEvent.click(screen.getByRole('button', { name: '暂停游戏' })))

it('stays quiet about the ranking budget until it is close', async () => {
  surviveAt(60)
  await start()
  // Early in the run there is nothing to say: no countdown, no toast.
  expect(screen.queryByLabelText(/成绩还能上榜/)).toBeNull()
  expect(screen.queryByLabelText(/成绩不再上榜/)).toBeNull()
})
it('counts the ranking budget down in the HUD once it is close', async () => {
  surviveAt(FARM_SUBMIT_WARN_FRAMES)
  await start()
  // Icon and number only; the full sentence is the aria-label.
  expect(screen.getByText('成绩有效 2:00')).toBeTruthy()
  expect(screen.getByLabelText('成绩还能上榜 120 秒，可在暂停面板结算上榜')).toBeTruthy()
  // The toast announces it once, and points at the way to bank the run.
  expect(screen.getByText('成绩有效 2:00 · 可结算')).toBeTruthy()
})
it('says out loud that the score is off the board past the budget', async () => {
  surviveAt(FARM_MAX_SUBMIT_FRAMES + 1)
  await start()
  expect(screen.getByText('已超 20 分钟')).toBeTruthy()
  expect(screen.getByLabelText('本局已超过 20 分钟，成绩不再上榜（本机保留）')).toBeTruthy()
  expect(screen.getByText(FARM_TOO_LONG_MESSAGE)).toBeTruthy()
})
it('settles the run from the pause panel through the same path as a death', async () => {
  surviveAt(600, 4321)
  await start()
  await pause()
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: '结束本局并结算成绩，提交到生存排行榜' })),
  )
  // One finisher, one round: the voluntary stop is scored like a death.
  expect(vi.mocked(finishFarm)).toHaveBeenCalledOnce()
  const [state, frames] = vi.mocked(finishFarm).mock.calls[0]
  expect(state.hp).toBe(0)
  expect(state.tick).toBe(600)
  expect(frames.length).toBeGreaterThan(0)
  expect(screen.getByText('演出落幕')).toBeTruthy()
  // The result page hands the round to the board, so the score is submitted.
  expect(screen.getByText(/·提交 /)).toBeTruthy()
  expect(vi.mocked(saveBestScore).mock.calls).toHaveLength(1)
})
it('keeps the exit past the budget but drops the promise of a rank', async () => {
  surviveAt(FARM_MAX_SUBMIT_FRAMES + 1)
  await start()
  await pause()
  // Not disabled: ending the run is still the only way out that keeps the
  // result. The label just stops promising a leaderboard entry.
  const end = screen.getByRole('button', { name: `结束本局，${FARM_TOO_LONG_MESSAGE}` })
  expect(end.textContent).toBe('结束本局')
  expect(screen.getByRole('alert').textContent).toBe(FARM_TOO_LONG_MESSAGE)
  await act(async () => fireEvent.click(end))
  expect(screen.getByText('演出落幕')).toBeTruthy()
  expect(vi.mocked(finishFarm)).toHaveBeenCalledOnce()
  expect(vi.mocked(finishFarm).mock.calls[0][0].hp).toBe(0)
})
