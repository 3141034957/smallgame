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
  expect(card.textContent).not.toContain('满级进化')
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
  expect(card.textContent).toContain('已满血，也可选择继续升级')
  expect((card as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(card)
  expect(select).toHaveBeenCalledExactlyOnceWith('heal')
})

it('names the school and how far along its ladder the pick lands', () => {
  const gear = gearWith({ drum: 2, range: 3 })
  render(<UpgradeChoices gear={gear} offered={['drum']} state={{ gear }} onSelect={() => {}} />)
  const card = screen.getByRole('button')
  expect(card.textContent).toContain('鼓组流')
  expect(card.textContent).toContain('第 2 层 / 共 5 层')
  expect(card.textContent).toContain('进化：雷霆鼓组')
  expect(card.textContent).toContain('Lv.3/5')
})

it('flashes a cross-school combo the pick would unlock', () => {
  // 鼓组流 already evolved; topping off the synth's chip completes 共振风暴.
  const gear = gearWith({ drum: 5, range: 5, synth: 5, arp: 4 })
  render(<UpgradeChoices gear={gear} offered={['arp']} state={{ gear }} onSelect={() => {}} />)
  const card = screen.getByRole('button')
  expect(card.textContent).toContain('已进化')
  expect(card.textContent).toContain('✦ 这次解锁 棱镜合成器')
  expect(card.textContent).toContain('✦ 触发组合技：共振风暴')
})
