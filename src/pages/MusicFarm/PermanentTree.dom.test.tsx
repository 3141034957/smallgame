// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PermanentTree } from './PermanentTree'
import {
  awardFarmCoins,
  buyFarmUpgrade,
  FARM_PROFILE_KEY,
  loadFarmProfile,
} from '@/features/farm/characters'
import {
  PERMANENT_BRANCHES,
  PERMANENT_CHAIN,
  PERMANENT_TOTAL_LEVELS,
} from '@/features/farm/permanent.mjs'
import { GUEST_SAVE_KEY } from '@/utils/accountStorage'
import { testStorage } from '@/test/storage'

// jsdom ships no scrollIntoView at all, which is exactly why the panel calls it
// through an optional call.
const scrollIntoView = vi.fn()
const scrolled: Element[] = []
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  scrollIntoView.mockClear()
  scrolled.length = 0
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: function (this: Element, options?: boolean | ScrollIntoViewOptions) {
      scrolled.push(this)
      scrollIntoView(options)
    },
  })
})
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
// Writes straight to the guest save: the panel keeps whatever it was rendered
// with, which is what another tab spending the coins looks like.
const writeSave = (patch: Record<string, unknown>) => {
  const guest = JSON.parse(localStorage.getItem(GUEST_SAVE_KEY) ?? '{}') as Record<string, string>
  guest[FARM_PROFILE_KEY] = JSON.stringify({ ...loadFarmProfile(), ...patch })
  localStorage.setItem(GUEST_SAVE_KEY, JSON.stringify(guest))
}
const fullChain = () => ({
  levels: Object.fromEntries(PERMANENT_CHAIN.map((item) => [item.id, 1] as const)),
  spent: 0,
})

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
  // The sticky banner and the note pinned to step 1 both carry the result.
  expect(screen.getAllByRole('status').map((el) => el.textContent)).toContain(
    `已获得 ${step(1).name}`,
  )
  expect(within(node(1)).getByRole('status').textContent).toBe(`已获得 ${step(1).name}`)
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

it('opens on the step that is waiting instead of at the top of the chain', () => {
  render(<Tree />)
  expect(scrollIntoView).toHaveBeenCalled()
  expect(scrolled.at(-1)).toBe(node(1).parentElement)
  expect(node(1).parentElement!.className).toContain('is-next')
})

it('follows the chain: a purchase scrolls the next step into view', async () => {
  awardFarmCoins('follow', chainPrice(2))
  render(<Tree />)
  scrolled.length = 0
  fireEvent.click(screen.getByRole('button', { name: buyLabel(1) }))
  await Promise.resolve()
  expect(scrolled.at(-1)).toBe(node(2).parentElement)
})

it('lands on the end of the chain once every step is bought', () => {
  writeSave({ growth: fullChain() })
  render(<Tree />)
  expect(total()).toContain(`${PERMANENT_TOTAL_LEVELS} / ${PERMANENT_TOTAL_LEVELS}`)
  expect(scrolled.at(-1)).toBe(node(PERMANENT_TOTAL_LEVELS).parentElement)
})

it('folds bought steps into a compact row without dropping any of them', async () => {
  awardFarmCoins('fold', chainPrice(2))
  render(<Tree />)
  fireEvent.click(screen.getByRole('button', { name: buyLabel(1) }))
  await Promise.resolve()
  const rows = () => screen.getAllByRole('listitem')
  // Compact is a visual change only: every step stays in the chain, in order.
  expect(rows()).toHaveLength(PERMANENT_TOTAL_LEVELS)
  expect(node(1).parentElement!.className).toContain('is-compact')
  const toggle = screen.getByRole('button', { name: '展开已购的 1 个强化步骤' })
  expect(toggle.textContent).toBe('已购 1')
  fireEvent.click(toggle)
  expect(node(1).parentElement!.className).not.toContain('is-compact')
  expect(rows()).toHaveLength(PERMANENT_TOTAL_LEVELS)
  expect(screen.getAllByRole('article')).toHaveLength(PERMANENT_TOTAL_LEVELS)
  expect(node(1).getAttribute('aria-label')).toBe(`第 1 步 ${step(1).name}`)
  expect(node(1).querySelector('.farm-growth-owned')!.textContent).toBe('已获得 ✓')
  expect(screen.getByRole('button', { name: buyLabel(2) })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '收起已购的 1 个强化步骤' }))
  expect(node(1).parentElement!.className).toContain('is-compact')
  expect(rows()).toHaveLength(PERMANENT_TOTAL_LEVELS)
  expect(screen.getAllByRole('article')).toHaveLength(PERMANENT_TOTAL_LEVELS)
})

it('shows why a purchase was refused next to the step that was pressed', () => {
  awardFarmCoins('refused', step(1).price)
  render(<Tree />)
  // Another tab empties the wallet after the panel rendered, so the click is
  // live but the store says no.
  writeSave({ coins: 0 })
  fireEvent.click(screen.getByRole('button', { name: buyLabel(1) }))
  expect(within(node(1)).getByRole('alert').textContent).toBe(`还差 ${step(1).price} 金币。`)
  expect(within(node(2)).queryByRole('alert')).toBeNull()
  // The banner pinned to the bottom of the scroll area says the same thing.
  expect(document.querySelector('.farm-growth-message')!.textContent).toBe(
    `还差 ${step(1).price} 金币。`,
  )
  expect(loadFarmProfile().coins).toBe(0)
  expect(total()).toContain('0 / ')
})

it('returns keyboard focus to the next purchase, including when it is unaffordable', () => {
  awardFarmCoins('navigation', step(1).price)
  render(<Tree />)
  fireEvent.click(screen.getByRole('button', { name: '定位下一步强化' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: buyLabel(1) }))
  fireEvent.click(document.activeElement!)
  fireEvent.click(screen.getByRole('button', { name: '定位下一步强化' }))
  expect(document.activeElement).toBe(node(2))
  expect(scrolled.at(-1)).toBe(node(2).parentElement)
  expect(loadFarmProfile().coins).toBe(0)
})
