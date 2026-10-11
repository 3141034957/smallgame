// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createFarm, type Gear } from '@/features/farm/rules.mjs'
import { UpgradeChoices } from './UpgradeChoices'
import { BuildSummary } from './BuildSummary'

const gearWith = (extra: Partial<Gear>): Gear => ({ ...createFarm('2026-10-04').gear, ...extra })

afterEach(cleanup)

it.each([
  [1, '间隔 1→0.75s'],
  [3, '间隔 0.75→0.5s'],
])('shows the actual frequency gain when upgrading drum Lv.%i', (level, gain) => {
  render(<UpgradeChoices gear={gearWith({ drum: level })} offered={['drum']} onSelect={() => {}} />)
  const card = screen.getByRole('button')
  expect(card.querySelector('p')?.textContent).toBe(gain)
})

it.each([
  [2, '每跳 1→2'],
  [4, '每跳 2→3 · 100击杀 +1'],
])('shows the damage and growth gains when upgrading drum Lv.%i', (level, gain) => {
  render(<UpgradeChoices gear={gearWith({ drum: level })} offered={['drum']} onSelect={() => {}} />)
  const card = screen.getByRole('button')
  expect(card.querySelector('p')?.textContent).toBe(gain)
  if (level === 4)
    expect(card.querySelector('p')?.getAttribute('aria-label')).toContain('余音最后一击')
})

it('shows the actual evolved damage when the final drum level completes the pair', () => {
  render(
    <UpgradeChoices
      gear={gearWith({ drum: 4, range: 5 })}
      offered={['drum']}
      onSelect={() => {}}
    />,
  )
  expect(screen.getByRole('button').querySelector('p')?.textContent).toBe('每跳 2→6 · 100击杀 +1')
})

it('shows the range gains and evolved damage without doubling accumulated growth', () => {
  const gear = gearWith({ drum: 5, range: 4 })
  render(
    <UpgradeChoices
      gear={gear}
      state={{ gear, drumEchoKills: 245 }}
      offered={['range']}
      onSelect={() => {}}
    />,
  )
  expect(screen.getByRole('button').querySelector('p')?.textContent).toBe(
    '每跳 5→8 · 扩散 +14 · 爆发 +2',
  )
})

it('keeps a normal speaker upgrade focused on its range gains', () => {
  render(
    <UpgradeChoices
      gear={gearWith({ drum: 3, range: 2 })}
      offered={['range']}
      onSelect={() => {}}
    />,
  )
  expect(screen.getByRole('button').querySelector('p')?.textContent).toBe('扩散 +2 · 爆发 +2')
})

it('shows final drum damage, rhythm and the next growth progress in the build summary', () => {
  const gear = gearWith({ drum: 5, range: 5 })
  render(<BuildSummary gear={gear} state={{ gear, drumEchoKills: 245 }} />)
  const summary = screen.getByRole('region', { name: '本局乐队' })
  expect(summary.textContent).toContain('每跳 8 · 0.5s · 成长 +2 · 45/100')
})

it('shows base drum properties when no live growth counter is available', () => {
  render(<BuildSummary gear={gearWith({ drum: 5, range: 0 })} />)
  expect(screen.getByRole('region', { name: '本局乐队' }).textContent).toContain(
    '每跳 3 · 0.5s · 成长 +0 · 0/100',
  )
})

it('does not show locked growth below the final drum level', () => {
  render(<BuildSummary gear={gearWith({ drum: 4 })} />)
  expect(screen.getByRole('region', { name: '本局乐队' }).textContent).not.toContain('成长 +')
})
