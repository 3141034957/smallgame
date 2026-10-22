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
  expect(card.classList.contains('is-evolution-ready')).toBe(true)
  expect(card.classList.contains('is-combo-ready')).toBe(true)
  expect(card.textContent?.match(/棱镜合成器/g)).toHaveLength(1)
})

it('marks a matching pick with the carried partner and preserves offered order', () => {
  const select = vi.fn()
  const gear = gearWith({ drum: 3 })
  render(<UpgradeChoices gear={gear} offered={['tempo', 'range', 'heal']} onSelect={select} />)
  const cards = screen.getAllByRole('button')
  expect(cards.map((card) => card.querySelector('.farm-choice-name')?.textContent)).toEqual([
    '节拍器',
    '共鸣音箱',
    '恢复满血',
  ])
  expect(cards[0].querySelector('.farm-choice-pair')).toBeNull()
  expect(cards[1].querySelector('.farm-choice-pair')?.textContent).toContain('鼓手咚咚 Lv.3')
  expect(cards[1].getAttribute('aria-label')).toContain('补齐配套：鼓手咚咚，等级 3')
  expect(cards[1].classList.contains('is-pair-ready')).toBe(true)
  fireEvent.click(cards[1])
  expect(select).toHaveBeenCalledExactlyOnceWith('range')
})

it('names the lost evolution paths without preventing a last-slot pick', () => {
  const select = vi.fn()
  const gear = gearWith({ drum: 2, synth: 1, magnet: 1, lucky: 1, sustain: 1, delay: 1 })
  render(<UpgradeChoices gear={gear} offered={['tempo']} onSelect={select} />)
  const card = screen.getByRole('button')
  expect(
    Array.from(card.querySelectorAll('.farm-choice-slot-warning')).map((item) => item.textContent),
  ).toEqual(['⚠鼓组流无法进化', '⚠合成器流无法进化'])
  expect(card.getAttribute('aria-label')).toContain(
    '芯片槽位已满，鼓组流缺少共鸣音箱，本局无法进化',
  )
  expect(card.getAttribute('aria-label')).toContain('合成器流缺少琶音器')
  expect((card as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(card)
  expect(select).toHaveBeenCalledExactlyOnceWith('tempo')
})

it('does not copy an unrelated near-combo hint into every card', () => {
  const gear = gearWith({ drum: 5, range: 5, synth: 5, arp: 4 })
  render(<UpgradeChoices gear={gear} offered={['tempo']} onSelect={() => {}} />)
  expect(screen.getByRole('button').textContent).not.toContain('共振风暴')
  expect(screen.getByRole('button').querySelector('.is-next')).toBeNull()
})

it('keeps damage exclusions and recipe progress in the focused button name', () => {
  const gear = gearWith({ echo: 2, deck: 3 })
  render(<UpgradeChoices gear={gear} offered={['lucky', 'needle']} onSelect={() => {}} />)
  const lucky = screen.getByRole('button', { name: /余音不暴击/ })
  expect(lucky.getAttribute('aria-label')).toContain('进化配方星雨麦克风：乐器 2/5，芯片 1/5')
  expect(lucky.querySelector('p')?.textContent).toContain('余音不暴击')
  const needle = screen.getByRole('button', { name: /命中伤害 \+（不含余音）/ })
  expect(needle.getAttribute('aria-label')).toContain('进化配方黑胶风暴台：乐器 3/5，芯片 1/5')
})

it('reads the drum growth last-hit requirement from the focused button', () => {
  render(
    <UpgradeChoices
      gear={gearWith({ drum: 4, range: 5 })}
      offered={['drum']}
      onSelect={() => {}}
    />,
  )
  const card = screen.getByRole('button', { name: /每 100 次余音最后一击/ })
  expect(card.getAttribute('aria-label')).toContain('余音每跳伤害 2 提升至 6')
  expect(card.getAttribute('aria-label')).toContain('解锁进化：雷霆鼓组')
})
