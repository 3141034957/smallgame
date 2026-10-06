// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PermanentTree } from './PermanentTree'
import { awardFarmCoins, loadFarmProfile } from '@/features/farm/characters'
import { testStorage } from '@/test/storage'

beforeEach(() => vi.stubGlobal('localStorage', testStorage()))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function Tree() {
  const [profile, setProfile] = useState(loadFarmProfile)
  return <PermanentTree profile={profile} onChange={setProfile} onClose={() => {}} />
}
it('shows all eight nodes immediately and prevents unaffordable purchases', () => {
  render(<Tree />)
  expect(screen.getByText('八项强化全部开放，各项独立购买，无关卡解锁要求。')).toBeTruthy()
  expect(screen.getAllByRole('article')).toHaveLength(8)
  expect(
    (screen.getByRole('button', { name: '升级守护音盾，花费18000金币' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(screen.getByText('还差 18,000 金币')).toBeTruthy()
})
it('buys from any branch, updates levels and price, persists across remounts, and confirms refunds', () => {
  awardFarmCoins('first', 20000)
  const mounted = render(<Tree />)
  fireEvent.click(screen.getByRole('button', { name: '升级守护音盾，花费18000金币' }))
  const shield = within(screen.getByRole('article', { name: '守护音盾' }))
  expect(shield.getByText('空盾 180 秒补 1 层')).toBeTruthy()
  expect(loadFarmProfile().coins).toBe(2000)
  mounted.unmount()
  render(<Tree />)
  expect(
    screen.getByRole('progressbar', { name: '守护音盾强化进度' }).getAttribute('aria-valuenow'),
  ).toBe('1')
  fireEvent.click(screen.getByRole('button', { name: '免费重置强化' }))
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(loadFarmProfile().coins).toBe(2000)
  fireEvent.click(screen.getByRole('button', { name: '免费重置强化' }))
  fireEvent.click(screen.getByRole('button', { name: '确认重置' }))
  expect(loadFarmProfile().coins).toBe(20000)
  expect(
    screen.getByRole('progressbar', { name: '守护音盾强化进度' }).getAttribute('aria-valuenow'),
  ).toBe('0')
})
