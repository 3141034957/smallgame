// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PermanentTree } from './PermanentTree'
import { awardFarmCoins, buyFarmUpgrade, loadFarmProfile } from '@/features/farm/characters'
import {
  PERMANENT_BRANCHES,
  PERMANENT_CHAIN,
  PERMANENT_TOTAL_LEVELS,
} from '@/features/farm/permanent.mjs'
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

// Effect names repeat along the chain (生命 +10 shows up five times), so every
// query keys off the step number instead of the label.
const step = (n: number) => PERMANENT_CHAIN[n - 1]
const branchName = (branch: string) => PERMANENT_BRANCHES.find((item) => item.id === branch)!.name
const node = (n: number) => screen.getByRole('article', { name: `第 ${n} 步 ${step(n).name}` })
const buyLabel = (n: number) => `升级第 ${n} 步 ${step(n).name}，花费${step(n).price}金币`
const buyButtons = () => Array.from(document.querySelectorAll('.farm-growth-buy'))
const total = () => document.querySelector('.farm-growth-total')!.textContent ?? ''
const chainPrice = (count: number) =>
  PERMANENT_CHAIN.slice(0, count).reduce((sum, item) => sum + item.price, 0)

it(`shows all ${PERMANENT_TOTAL_LEVELS} steps at once and leaves only the first one buyable`, () => {
  render(<Tree />)
  expect(screen.getByText('下局生效 · 按顺序解锁')).toBeTruthy()
  expect(screen.getAllByRole('listitem')).toHaveLength(PERMANENT_TOTAL_LEVELS)
  expect(screen.getAllByRole('article')).toHaveLength(PERMANENT_TOTAL_LEVELS)
  expect(total()).toContain(`0 / ${PERMANENT_TOTAL_LEVELS}`)
  // One buy button on the whole page, and it belongs to step 1.
  const buttons = buyButtons()
  expect(buttons).toHaveLength(1)
  expect(buttons[0].getAttribute('aria-label')).toBe(buyLabel(1))
  expect(node(1).parentElement!.className).toContain('is-next')
  // Everything behind it is sealed: no button, no way to reach it.
  for (let n = 2; n <= PERMANENT_TOTAL_LEVELS; n += 1) {
    const card = node(n)
    expect(within(card).queryByRole('button')).toBeNull()
    expect(card.querySelector('.farm-growth-sealed')!.textContent).toBe(
      `未解锁 · ${branchName(step(n).branch)}`,
    )
    expect(card.parentElement!.className).toContain('is-locked')
  }
  expect(node(2).parentElement!.querySelector('.farm-growth-tile img')!.getAttribute('src')).toBe(
    '/assets/icons/lock.webp',
  )
  // Nothing bought yet, so there is nothing to refund.
  expect((screen.getByRole('button', { name: '免费重置强化' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect(document.body.textContent).not.toContain('null')
})

it('keeps the first step disabled while coins fall short and spends nothing on a click', () => {
  awardFarmCoins('short', step(1).price - 1)
  render(<Tree />)
  const buy = screen.getByRole('button', { name: buyLabel(1) }) as HTMLButtonElement
  expect(buy.disabled).toBe(true)
  expect(node(1).querySelector('.farm-growth-shortfall')!.textContent).toBe('还差 ✦1')
  fireEvent.click(buy)
  expect(loadFarmProfile().coins).toBe(step(1).price - 1)
  expect(screen.queryByRole('status')).toBeNull()
  expect(total()).toContain('0 / ')
})

it('buys the head of the chain, unlocks the next step and survives a remount', () => {
  awardFarmCoins('head', chainPrice(2))
  const mounted = render(<Tree />)
  fireEvent.click(screen.getByRole('button', { name: buyLabel(1) }))
  expect(node(1).querySelector('.farm-growth-owned')!.textContent).toBe('已获得 ✓')
  expect(node(1).parentElement!.className).toContain('is-trained')
  expect(node(1).parentElement!.querySelector('.farm-growth-tile img')!.getAttribute('src')).toBe(
    `/assets/icons/${step(1).kind}.webp`,
  )
  // Step 2 opens, step 3 stays shut: the chain never skips ahead.
  expect(buyButtons()).toHaveLength(1)
  expect(screen.getByRole('button', { name: buyLabel(2) })).toBeTruthy()
  expect(within(node(3)).queryByRole('button')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe(`已获得 ${step(1).name}`)
  expect(loadFarmProfile().coins).toBe(step(2).price)
  expect(total()).toContain(`1 / ${PERMANENT_TOTAL_LEVELS}`)
  mounted.unmount()
  render(<Tree />)
  expect(node(1).querySelector('.farm-growth-owned')).toBeTruthy()
  expect(screen.getByRole('button', { name: buyLabel(2) })).toBeTruthy()
  expect(within(node(3)).queryByRole('button')).toBeNull()
  expect(total()).toContain(`1 / ${PERMANENT_TOTAL_LEVELS}`)
})

it('refuses to skip ahead: step 3 has no button and the store rejects it too', () => {
  awardFarmCoins('skip', chainPrice(3))
  render(<Tree />)
  expect(within(node(3)).queryByRole('button')).toBeNull()
  expect(screen.queryByRole('button', { name: buyLabel(3) })).toBeNull()
  expect(node(3).querySelector('.farm-growth-sealed')!.textContent).toBe(
    `未解锁 · ${branchName(step(3).branch)}`,
  )
  // Affording every earlier step is still not enough: order is enforced.
  const coins = loadFarmProfile().coins
  const result = buyFarmUpgrade(step(3).id, 0)
  expect(result.error).toBeTruthy()
  expect(result.paid).toBe(false)
  expect(loadFarmProfile().coins).toBe(coins)
  expect(total()).toContain('0 / ')
})

it('ignores a second click that lands before the first purchase settles', () => {
  awardFarmCoins('rapid', step(1).price * 3)
  render(<Tree />)
  const buy = screen.getByRole('button', { name: buyLabel(1) })
  fireEvent.click(buy)
  fireEvent.click(buy)
  expect(loadFarmProfile().coins).toBe(step(1).price * 2)
  expect(total()).toContain('1 / ')
  // Two purchases would have opened step 3; only step 2 did.
  expect(screen.getByRole('button', { name: buyLabel(2) })).toBeTruthy()
  expect(within(node(3)).queryByRole('button')).toBeNull()
})

it('refunds every coin on a confirmed reset and keeps them when cancelled', async () => {
  awardFarmCoins('reset', chainPrice(2))
  render(<Tree />)
  fireEvent.click(screen.getByRole('button', { name: buyLabel(1) }))
  // The component latches until the purchase settles; a real browser gets this
  // gap for free between two user events.
  await Promise.resolve()
  fireEvent.click(screen.getByRole('button', { name: buyLabel(2) }))
  expect(loadFarmProfile().coins).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: '免费重置强化' }))
  const confirm = screen.getByRole('group', { name: '确认重置强化' })
  expect(within(confirm).getByText(`返还 ✦ ${chainPrice(2).toLocaleString()}`)).toBeTruthy()
  fireEvent.click(within(confirm).getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('group', { name: '确认重置强化' })).toBeNull()
  expect(loadFarmProfile().coins).toBe(0)
  expect(node(1).querySelector('.farm-growth-owned')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '免费重置强化' }))
  fireEvent.click(screen.getByRole('button', { name: '确认重置' }))
  expect(loadFarmProfile().coins).toBe(chainPrice(2))
  expect(screen.getByRole('status').textContent).toBe('强化已重置，金币已返还。')
  expect(total()).toContain(`0 / ${PERMANENT_TOTAL_LEVELS}`)
  expect(node(1).querySelector('.farm-growth-owned')).toBeNull()
  expect(screen.getByRole('button', { name: buyLabel(1) })).toBeTruthy()
  expect((screen.getByRole('button', { name: '免费重置强化' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
})
