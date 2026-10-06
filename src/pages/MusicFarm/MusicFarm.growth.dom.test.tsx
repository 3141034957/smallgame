// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { awardFarmCoins, FARM_PROFILE_KEY } from '@/features/farm/characters'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { activateAccount, installAccountSave } from '@/utils/accountStorage'
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
  activateAccount(null)
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

it('refreshes the wallet when another tab of the same account saves progress', async () => {
  const owner = 'account_sync_test'
  activateAccount(owner)
  installAccountSave(owner, { data: {}, revision: 1, dirty: false })
  render(
    <MemoryRouter initialEntries={['/farm?day=2026-10-06']}>
      <MusicFarm />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: '打开永久强化' }))
  const wallet = () => within(screen.getByRole('dialog'))
  expect(wallet().getByText('✦ 0')).toBeTruthy()
  // The other tab of this account writes the cloud save, not the legacy keys.
  const saved = JSON.stringify({
    coins: 9000,
    owned: [],
    selected: 'bear-drums',
    rewardedRuns: [],
  })
  localStorage.setItem(
    `farm-account-save-v1:${owner}`,
    JSON.stringify({ data: { [FARM_PROFILE_KEY]: saved }, revision: 2, dirty: false }),
  )
  await act(async () => {
    fireEvent(window, new StorageEvent('storage', { key: `farm-account-save-v1:${owner}` }))
  })
  expect(wallet().getByText('✦ 9,000')).toBeTruthy()
})
