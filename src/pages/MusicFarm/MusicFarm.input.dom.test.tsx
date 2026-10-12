// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
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
// Every point the loop asks the rules to simulate: where the band walks is
// read straight off these, so a swallowed key shows up as a missing step.
let points: number[][]
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
  points = []
  // The band never dies and never levels: only the walk is under test.
  vi.mocked(stepFarm).mockImplementation((previous, point) => {
    points.push([...point])
    return {
      state: { ...previous, position: [...point], tick: previous.tick + 1, offered: [] },
      events: [],
    }
  })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  vi.mocked(stepFarm).mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const start = async () => {
  render(
    <MemoryRouter initialEntries={['/farm?day=2026-10-04']}>
      <MusicFarm />
    </MemoryRouter>,
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '开始无限模式' })))
  act(() => frame(1000))
  act(() => frame(1120))
}
const walkedX = () => points.at(-1)![0]
const press = (key: string, target: HTMLElement) => act(() => fireEvent.keyDown(target, { key }))
const release = (key: string, target: HTMLElement) => act(() => fireEvent.keyUp(target, { key }))
it('keeps walking from the keyboard after a knob on the HUD was clicked', async () => {
  await start()
  const field = screen.getByRole('application', { name: /生存战场/ })
  // Standing still first: nothing is held, so the position does not move.
  expect(walkedX()).toBe(50)
  await press('d', field)
  act(() => frame(1240))
  const walked = walkedX()
  expect(walked).toBeGreaterThan(50)
  await release('d', field)
  // The sound knob is a real button: a browser hands it the focus on click,
  // which used to take the whole keyboard away from the arena.
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '静音' })))
  const knob = screen.getByRole('button', { name: '开启声音' })
  act(() => knob.focus())
  expect(document.activeElement).toBe(knob)
  act(() => frame(1360))
  expect(walkedX()).toBe(walked)
  await press('d', knob)
  act(() => frame(1480))
  expect(walkedX()).toBeGreaterThan(walked)
})
it('never reads movement out of a nickname being typed', async () => {
  await start()
  const board = screen.getByRole('application', { name: /生存战场/ })
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  await press('d', input)
  act(() => frame(1600))
  expect(walkedX()).toBe(50)
  input.remove()
  // The arena itself still answers.
  await press('d', board)
  act(() => frame(1720))
  expect(walkedX()).toBeGreaterThan(50)
})
