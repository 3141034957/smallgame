// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UpgradeChoices } from './UpgradeChoices'
import { createFarm } from '@/features/farm/rules.mjs'

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
