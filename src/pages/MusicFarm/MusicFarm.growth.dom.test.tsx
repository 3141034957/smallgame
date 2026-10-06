// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { awardFarmCoins } from '@/features/farm/characters'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { testStorage } from '@/test/storage'

vi.mock('./FarmBoard', () => ({ FarmBoard: () => <div>测试总榜</div> }))
vi.mock('./characterSprite', () => ({
  loadFarmCharacterSprite: async () => document.createElement('canvas'),
}))
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  localStorage.setItem(FARM_HELP_SEEN_KEY, '1')
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  )
  awardFarmCoins('test-run', 10000)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('uses purchases made on the ready screen at start, then keeps the running snapshot unchanged', async () => {
  render(
    <MemoryRouter initialEntries={['/farm?day=2026-10-06']}>
      <MusicFarm />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: '打开永久强化' }))
  fireEvent.click(screen.getByRole('button', { name: '升级舞台体魄，花费1500金币' }))
  fireEvent.click(screen.getByRole('button', { name: '返回游戏' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /开始玩/ })))
  expect(screen.getByRole('progressbar', { name: '生命值' }).getAttribute('aria-valuemax')).toBe(
    '105',
  )
  fireEvent.click(screen.getByRole('button', { name: '打开永久强化' }))
  fireEvent.click(screen.getByRole('button', { name: '升级舞台体魄，花费2500金币' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '返回游戏' })))
  expect(screen.getByRole('progressbar', { name: '生命值' }).getAttribute('aria-valuemax')).toBe(
    '105',
  )
  fireEvent.click(screen.getByRole('button', { name: '打开永久强化' }))
  fireEvent.click(screen.getByRole('button', { name: '免费重置强化' }))
  fireEvent.click(screen.getByRole('button', { name: '确认重置' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '返回游戏' })))
  expect(screen.getByRole('progressbar', { name: '生命值' }).getAttribute('aria-valuemax')).toBe(
    '105',
  )
  fireEvent.click(screen.getByRole('button', { name: '暂停游戏' }))
  fireEvent.click(screen.getByRole('button', { name: '重新开始' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /开始玩/ })))
  expect(screen.getByRole('progressbar', { name: '生命值' }).getAttribute('aria-valuemax')).toBe(
    '100',
  )
})
