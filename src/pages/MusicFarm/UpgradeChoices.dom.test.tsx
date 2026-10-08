// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UpgradeChoices } from './UpgradeChoices'
import { createFarm, type Gear } from '@/features/farm/rules.mjs'

const gearWith = (extra: Partial<Gear>): Gear => ({ ...createFarm('2026-10-04').gear, ...extra })

afterEach(cleanup)

it('renders the recovery card alongside gear and selects its independent replay ID', () => {
  const select = vi.fn()
  render(
    <UpgradeChoices
      gear={createFarm('2026-10-04').gear}
      offered={['drum', 'heal', 'range']}
      hp={12}
      maxHp={150}
      onSelect={select}
    />,
  )
  const card = screen.getByRole('button', { name: /恢复满血/ })
  expect(card.textContent).toContain('生命 12 → 150')
  expect(card.textContent).not.toContain('Lv.')
  expect(card.textContent).not.toContain('进化：')
  expect(screen.getAllByRole('button')).toHaveLength(3)
  fireEvent.click(card)
  expect(select).toHaveBeenCalledExactlyOnceWith('heal')
})

it('keeps a full-health recovery choice usable when the loadout has nothing left to upgrade', () => {
  const select = vi.fn()
  render(
    <UpgradeChoices
      gear={createFarm('2026-10-04').gear}
      offered={['heal']}
      hp={100}
      maxHp={100}
      onSelect={select}
    />,
  )
  const card = screen.getByRole('button', { name: /恢复满血/ })
  // Full health still shows the heal: the card promises 100 → 100 and stays
  // clickable instead of repeating "已回满" in prose.
  expect(card.textContent).toContain('生命 100 → 100')
  expect((card as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(card)
  expect(select).toHaveBeenCalledExactlyOnceWith('heal')
})

it('names the school and how far along its ladder the pick lands', () => {
  const gear = gearWith({ drum: 2, range: 3 })
  render(<UpgradeChoices gear={gear} offered={['drum']} state={{ gear }} onSelect={() => {}} />)
  const card = screen.getByRole('button')
  expect(card.textContent).toContain('鼓组流')
  expect(card.querySelector('.farm-school-layer')?.textContent).toBe('Lv.2/5')
  expect(card.textContent).toContain('进化：雷霆鼓组')
  expect(card.textContent).toContain('3/5 ＋ 3/5')
})

it('keeps the evolution lines in one note wrapper, which phones fold into a row', () => {
  const gear = gearWith({ drum: 2, range: 3 })
  render(<UpgradeChoices gear={gear} offered={['drum']} state={{ gear }} onSelect={() => {}} />)
  const note = screen.getByRole('button').querySelector('.farm-choice-note')
  expect(note?.textContent).toContain('进化：雷霆鼓组')
  expect(note?.querySelector('.farm-school-progress')).toBeTruthy()
})

it('flashes a cross-school combo the pick would unlock', () => {
  // 鼓组流 already evolved; topping off the synth's chip completes 共振风暴.
  const gear = gearWith({ drum: 5, range: 5, synth: 5, arp: 4 })
  render(<UpgradeChoices gear={gear} offered={['arp']} state={{ gear }} onSelect={() => {}} />)
  const card = screen.getByRole('button')
  expect(card.querySelector('.farm-school-layer')?.textContent).toBe('终极')
  expect(card.textContent).toContain('✦ 这次解锁 棱镜合成器')
  expect(card.textContent).toContain('✦ 触发组合技：共振风暴')
})
