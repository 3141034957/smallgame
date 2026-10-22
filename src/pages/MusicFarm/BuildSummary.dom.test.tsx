// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createFarm, type Gear } from '@/features/farm/rules.mjs'
import { BuildSummary } from './BuildSummary'

const gearWith = (extra: Partial<Gear>): Gear => ({ ...createFarm('2026-10-04').gear, ...extra })

afterEach(cleanup)

it('omits an empty build', () => {
  render(<BuildSummary gear={gearWith({})} />)
  expect(screen.queryByRole('region', { name: '本局乐队' })).toBeNull()
})

it('names the weapon and its missing chip instead of showing an unexplained level zero', () => {
  render(<BuildSummary gear={gearWith({ drum: 3 })} />)
  const row = screen.getByRole('listitem', { name: '鼓组流' })
  const parts = row.querySelectorAll('dl > div')
  expect(parts[0].textContent).toContain('鼓手咚咚Lv.3')
  expect(parts[1].textContent).toContain('共鸣音箱缺少')
  expect(row.textContent).not.toContain('Lv.0')
  const progress = within(row).getByRole('progressbar', { name: '鼓组流进化' })
  expect(progress.getAttribute('aria-valuenow')).toBe('3')
  expect(progress.getAttribute('aria-valuemax')).toBe('10')
  expect(progress.getAttribute('aria-valuetext')).toBe('3/10，缺少共鸣音箱')
})

it('identifies the missing weapon when only its chip was carried', () => {
  render(<BuildSummary gear={gearWith({ range: 2 })} />)
  const row = screen.getByRole('listitem', { name: '鼓组流' })
  const parts = row.querySelectorAll('dl > div')
  expect(parts[0].textContent).toContain('鼓手咚咚缺少')
  expect(parts[1].textContent).toContain('共鸣音箱Lv.2')
  expect(within(row).getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
    '2/10，缺少鼓手咚咚',
  )
})

it('shows both named levels and their combined evolution progress for a matching pair', () => {
  render(<BuildSummary gear={gearWith({ drum: 4, range: 3 })} />)
  const row = screen.getByRole('listitem', { name: '鼓组流' })
  expect(row.textContent).toContain('鼓手咚咚Lv.4')
  expect(row.textContent).toContain('共鸣音箱Lv.3')
  expect(row.textContent).not.toContain('缺少')
  expect(row.querySelector('.farm-school-layer')?.textContent).toBe('7/10')
  expect(within(row).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('7')
})

it('retains the final form, active combo and exact drum growth without doubling the bonus', () => {
  const gear = gearWith({ drum: 5, range: 5, synth: 5, arp: 5 })
  render(<BuildSummary gear={gear} state={{ gear, drumEchoKills: 245 }} />)
  const row = screen.getByRole('listitem', { name: '鼓组流' })
  expect(row.textContent).toContain('雷霆鼓组')
  expect(row.querySelector('.farm-school-layer')?.textContent).toBe('终极')
  expect(within(row).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10')
  expect(within(row).getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
    '已进化为雷霆鼓组',
  )
  expect(row.textContent).toContain('每跳 8 · 0.5s · 成长 +2 · 45/100')
  expect(row.querySelector('.farm-build-drum')?.getAttribute('aria-label')).toContain(
    '每 100 次余音最后一击伤害加 1',
  )
  expect(row.querySelector('.farm-build-drum')?.getAttribute('aria-label')).toContain(
    '余音不受命中伤害和暴击加成',
  )
  expect(screen.getByText('本局组合技')).toBeTruthy()
  expect(screen.getByText('共振风暴')).toBeTruthy()
})

it('marks a blocked evolution and never suggests an impossible combo as the next step', () => {
  render(
    <BuildSummary
      gear={gearWith({
        drum: 5,
        synth: 5,
        tempo: 1,
        magnet: 1,
        lucky: 1,
        sustain: 1,
        delay: 1,
      })}
    />,
  )
  const row = screen.getByRole('listitem', { name: '鼓组流' })
  expect(row.querySelector('.farm-school-layer')?.textContent).toBe('无法进化')
  expect(within(row).getByRole('progressbar').getAttribute('aria-valuetext')).toBe(
    '缺少共鸣音箱，槽位已满，本局无法进化',
  )
  expect(screen.queryByText('共振风暴')).toBeNull()
  expect(screen.queryByText('下一步')).toBeNull()
})

it('keeps attainable combo hints while omitting a combo whose partners compete for one slot', () => {
  const { rerender } = render(<BuildSummary gear={gearWith({ drum: 5, synth: 5 })} />)
  expect(screen.getByText('下一步')).toBeTruthy()
  expect(screen.getByText('共振风暴')).toBeTruthy()
  rerender(
    <BuildSummary
      gear={gearWith({ drum: 5, synth: 5, tempo: 1, magnet: 1, lucky: 1, sustain: 1 })}
    />,
  )
  expect(screen.getByRole('listitem', { name: '鼓组流' }).textContent).not.toContain('无法进化')
  expect(screen.queryByText('共振风暴')).toBeNull()
})

it('keeps drum growth locked below level five', () => {
  const gear = gearWith({ drum: 4, range: 5 })
  render(<BuildSummary gear={gear} state={{ gear, drumEchoKills: 245 }} />)
  const row = screen.getByRole('listitem', { name: '鼓组流' })
  expect(row.querySelector('.farm-build-drum')).toBeNull()
  expect(row.textContent).not.toContain('成长 +')
})
