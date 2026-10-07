// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PermanentTree } from './PermanentTree'
import { awardFarmCoins, loadFarmProfile, type FarmProfile } from '@/features/farm/characters'
import { PERMANENT_UPGRADES } from '@/features/farm/permanent.mjs'
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
  const meter = within(screen.getByRole('article', { name: '舞台体魄' })).getByRole('progressbar', {
    name: '舞台体魄强化进度',
  })
  expect(meter.getAttribute('aria-valuemax')).toBe('12')
  expect(meter.querySelectorAll('i')).toHaveLength(12)
  expect(meter.querySelectorAll('i.is-on')).toHaveLength(0)
})
it('reads each school as a tier ladder I → IV with every tier open', () => {
  render(<Tree />)
  const ladders: Record<string, string[]> = {
    生存保障: ['I', 'II', 'III', 'IV'],
    攻击成长: ['I', 'II'],
    操作手感: ['I', 'II'],
  }
  for (const [branch, tiers] of Object.entries(ladders)) {
    const school = screen.getByRole('region', { name: branch })
    const chips = Array.from(school.querySelectorAll('.farm-growth-tier')).map(
      (chip) => chip.textContent,
    )
    expect(chips).toEqual(tiers)
  }
  const survival = screen.getByRole('region', { name: '生存保障' })
  // Deepest tier is buyable on its own: no rank is locked behind an earlier one.
  for (const name of ['舞台体魄', '舞台护甲', '生命回响', '守护音盾'])
    expect(within(survival).getByRole('article', { name })).toBeTruthy()
  expect(survival.querySelector('.farm-growth-tier.is-trained')).toBeNull()
  expect(screen.getAllByRole('listitem')).toHaveLength(8)
})
it('labels a maxed node as finished instead of offering a null price', () => {
  const levels = Object.fromEntries(
    PERMANENT_UPGRADES.map((item) => [item.id, item.max]),
  ) as NonNullable<FarmProfile['growth']>['levels']
  render(
    <PermanentTree
      profile={{ ...loadFarmProfile(), growth: { levels, spent: 0 } }}
      onChange={() => {}}
      onClose={() => {}}
    />,
  )
  for (const item of PERMANENT_UPGRADES) {
    const node = screen.getByRole('article', { name: item.name })
    expect(node.querySelector('button')!.getAttribute('aria-label')).toBe(`${item.name}已满级`)
    expect(node.querySelector('button')!.className).toContain('is-maxed')
    expect(node.className).toContain('is-maxed')
    const meter = within(node).getByRole('progressbar')
    expect(meter.querySelectorAll('i.is-on')).toHaveLength(item.max)
    expect(node.querySelector('.farm-growth-seal')!.textContent).toBe('✓')
    expect(node.parentElement!.querySelector('.farm-growth-tier.is-maxed')).toBeTruthy()
  }
  expect(document.body.textContent).not.toContain('null')
})
it('lights one level pip per purchase and ignores a click that repeats before it settles', () => {
  awardFarmCoins('pips', 10000)
  render(<Tree />)
  const buy = screen.getByRole('button', { name: '升级舞台体魄，花费1500金币' })
  fireEvent.click(buy)
  fireEvent.click(buy)
  const node = screen.getByRole('article', { name: '舞台体魄' })
  expect(node.className).toContain('is-trained')
  expect(node.parentElement!.querySelector('.farm-growth-tier.is-trained')).toBeTruthy()
  const meter = within(node).getByRole('progressbar')
  expect(meter.getAttribute('aria-valuenow')).toBe('1')
  expect(meter.querySelectorAll('i.is-on')).toHaveLength(1)
  expect(loadFarmProfile().coins).toBe(8500)
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
