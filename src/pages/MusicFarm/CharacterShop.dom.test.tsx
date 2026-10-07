// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CharacterShop } from './CharacterShop'
import { UpgradeChoices } from './UpgradeChoices'
import { BuildSummary } from './BuildSummary'
import { FarmHelp } from './FarmHelp'
import { BadgeWall } from './BadgeWall'
import { BAND_CHARACTERS } from '@/features/farm/characterRoster.mjs'
import { FARM_PROFILE_KEY, loadFarmProfile } from '@/features/farm/characters'
import { createFarm, type FarmRound, type TalentId, TALENTS } from '@/features/farm/rules.mjs'
import { farmShareText } from '@/features/farm/share'
import { loadFarmCareer } from '@/features/farm/stats'
import { loadFarmAchievements } from '@/features/farm/achievements'
import { testStorage } from '@/test/storage'

beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  localStorage.setItem(
    FARM_PROFILE_KEY,
    JSON.stringify({
      coins: 99,
      owned: BAND_CHARACTERS.map((item) => item.id),
      selected: 'bear-drums',
      rewardedRuns: [],
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Shop() {
  const [profile, setProfile] = useState(loadFarmProfile)
  return <CharacterShop profile={profile} onChange={setProfile} />
}

it('keeps all nine previews, equipped identities and saved selections together', () => {
  const first = render(<Shop />)
  for (const character of BAND_CHARACTERS.slice(1)) {
    fireEvent.click(screen.getByRole('button', { name: `预览${character.name}` }))
    expect(screen.getByRole('img', { name: character.name }).getAttribute('src')).toBe(
      character.image,
    )
    fireEvent.click(screen.getByRole('button', { name: '使用角色' }))
    expect(loadFarmProfile().selected).toBe(character.id)
    expect(loadFarmProfile().coins).toBe(99)
    expect(screen.getByRole('button', { name: '使用中' })).toBeTruthy()
  }
  first.unmount()
  render(<Shop />)
  expect(screen.getByRole('img', { name: '打碟机哔哔' }).getAttribute('src')).toContain(
    'robot.webp',
  )
  expect(screen.getByRole('button', { name: '预览打碟机哔哔' }).getAttribute('aria-pressed')).toBe(
    'true',
  )
})

it('uses the same identities across upgrades, help, builds, career and share text', () => {
  for (const character of BAND_CHARACTERS) {
    const id = character.talentId as TalentId
    const gear = { ...createFarm('2026-10-06').gear, [id]: 1 }
    const talent = TALENTS.find((item) => item.id === id)!
    expect(talent.characterId).toBe(character.id)
    expect(talent.name).toBe(character.name)
    expect(talent.icon).toBe(character.icon)
    render(<UpgradeChoices gear={gear} offered={[id]} onSelect={() => {}} />)
    expect(screen.getByRole('button').textContent).toContain(`乐队成员 · ${talent.tag}`)
    expect(screen.getByRole('button').textContent).toContain(character.name)
    cleanup()
    render(<BuildSummary gear={gear} />)
    expect(screen.getByLabelText('本局乐队').textContent).toContain(character.name)
    // Levels are the only extra line: the name above already says who is playing.
    expect(screen.getByLabelText('本局乐队').textContent).toContain('Lv.1 ＋ Lv.0')
    cleanup()
    render(
      <BadgeWall
        log={loadFarmAchievements()}
        career={{ ...loadFarmCareer(), gear: { [id]: 1 } }}
      />,
    )
    expect(screen.getByText(character.name)).toBeTruthy()
    cleanup()
    const round = { gear, seconds: 10, score: 100, harvested: 2, bosses: 0 } as FarmRound
    expect(farmShareText(round, '2026-10-06')).toContain(`主力 ${character.name} Lv.1`)
  }
  render(<FarmHelp onClose={() => {}} />)
  for (const character of BAND_CHARACTERS)
    expect(screen.getByText(new RegExp(character.name))).toBeTruthy()
})

it('presents the additional synthesizer as an instrument rather than another robot', () => {
  const gear = { ...createFarm('2026-10-06').gear, synth: 1 }
  render(<UpgradeChoices gear={gear} offered={['synth']} onSelect={() => {}} />)
  expect(screen.getByRole('button').textContent).toContain('辅助乐器 · 扇形音浪')
  expect(screen.getByRole('button').textContent).not.toContain('乐队成员')
  cleanup()
  render(<BuildSummary gear={gear} />)
  expect(screen.getByLabelText('本局乐队').textContent).toContain('辅助合成器')
  expect(screen.getByLabelText('本局乐队').textContent).toContain('Lv.1 ＋ Lv.0')
})
