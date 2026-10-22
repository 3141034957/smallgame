// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MONSTERS } from '@/features/farm/monsters.mjs'
import { MAX_GEAR_LEVEL } from '@/features/farm/rules.mjs'
import { SCHOOL_COMBOS, SCHOOL_LIST } from '@/features/farm/help'
import { FarmHelp } from './FarmHelp'

afterEach(cleanup)

it('starts with complete school recipes and keeps the other sections out of navigation', () => {
  render(<FarmHelp onClose={() => {}} />)
  const panel = screen.getByRole('tabpanel', { name: /查看流派/ })
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  expect(screen.getByRole('tab', { selected: true }).textContent).toBe('查看流派')
  for (const school of SCHOOL_LIST) {
    const recipe = within(panel).getByLabelText(`${school.name}进化配方`)
    expect(recipe.textContent).toContain(`${school.weaponName} Lv.${MAX_GEAR_LEVEL}`)
    expect(recipe.textContent).toContain(`${school.chipName} Lv.${MAX_GEAR_LEVEL}`)
    expect(within(panel).getByText(school.form)).toBeTruthy()
  }
  expect(screen.queryByRole('heading', { name: SCHOOL_COMBOS[0].name })).toBeNull()
  expect(screen.queryByRole('heading', { name: MONSTERS[0].name })).toBeNull()
})

it('switches to the source-of-truth combo effects and resets list scrolling', () => {
  const { container } = render(<FarmHelp onClose={() => {}} />)
  const scroller = container.querySelector('.farm-guide-content')!
  scroller.scrollTop = 300
  fireEvent.click(screen.getByRole('tab', { name: /查看组合/ }))
  expect(scroller.scrollTop).toBe(0)
  const panel = screen.getByRole('tabpanel', { name: /查看组合/ })
  for (const combo of SCHOOL_COMBOS) {
    expect(within(panel).getByRole('heading', { name: combo.name })).toBeTruthy()
    expect(within(panel).getByText(combo.requirement)).toBeTruthy()
    expect(within(panel).getByRole('list', { name: combo.effect })).toBeTruthy()
  }
  expect(screen.queryByRole('heading', { name: SCHOOL_LIST[0].name })).toBeNull()
})

it('lets arrow, Home and End keys select and focus tabs with wraparound', () => {
  render(<FarmHelp onClose={() => {}} />)
  const tabs = screen.getAllByRole('tab')
  tabs[0].focus()
  fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(tabs[2])
  expect(tabs[2].getAttribute('aria-selected')).toBe('true')
  expect(tabs[0].tabIndex).toBe(-1)
  expect(tabs[2].tabIndex).toBe(0)
  fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
  expect(document.activeElement).toBe(tabs[0])
  fireEvent.keyDown(tabs[0], { key: 'End' })
  expect(document.activeElement).toBe(tabs[2])
  fireEvent.keyDown(tabs[2], { key: 'Home' })
  expect(document.activeElement).toBe(tabs[0])
  const panel = screen.getByRole('tabpanel')
  expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id)
  expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
})

it('shows every monster attack and its actual first and repeat appearance times', () => {
  render(<FarmHelp onClose={() => {}} />)
  fireEvent.click(screen.getByRole('tab', { name: /查看怪物/ }))
  const panel = screen.getByRole('tabpanel', { name: /查看怪物/ })
  for (const monster of MONSTERS) {
    const card = within(panel).getByRole('heading', { name: monster.name }).closest('article')!
    expect(card.querySelector('img')?.getAttribute('src')).toBe(monster.image)
    for (const phrase of monster.attack.split(/[，、；。]/).filter(Boolean))
      expect(card.textContent).toContain(phrase)
    const timing = card.querySelector('.farm-guide-timing')!
    expect(timing.getAttribute('aria-label')).toContain(
      `首次登场：${monster.starts === 0 ? '开场' : `${monster.starts} 秒`}`,
    )
    if (monster.interval)
      expect(timing.getAttribute('aria-label')).toContain(`每 ${monster.interval} 秒登场`)
  }
})

it('keeps the return action available after changing sections', () => {
  const close = vi.fn()
  render(<FarmHelp onClose={close} />)
  fireEvent.click(screen.getByRole('tab', { name: /查看怪物/ }))
  fireEvent.click(screen.getByRole('button', { name: '关闭帮助并返回' }))
  expect(close).toHaveBeenCalledOnce()
})
