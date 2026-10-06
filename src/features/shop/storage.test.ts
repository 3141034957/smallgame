import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buyCharacter, getSelected, getUnlocks, selectCharacter } from './storage'
import { LEGACY_PROFILE_KEY, loadLegacyProfile, STAR_CURRENCY_KEY } from '@/utils/legacyProfile'
import { addStars, getStarBalance } from '@/utils/starCurrency'
import { testStorage } from '@/test/storage'

beforeEach(() => vi.stubGlobal('localStorage', testStorage()))
afterEach(() => vi.unstubAllGlobals())
it('migrates old stars and owned characters together without writing during reads', () => {
  localStorage.setItem(STAR_CURRENCY_KEY, '8')
  localStorage.setItem('character-unlocks-v1', '["penguin","unknown",123,"penguin"]')
  localStorage.setItem('character-selected-v1', 'penguin')
  expect(loadLegacyProfile()).toEqual({
    stars: 8,
    unlocks: ['steampunk', 'penguin'],
    selected: 'penguin',
  })
  expect(localStorage.getItem(LEGACY_PROFILE_KEY)).toBeNull()
  buyCharacter('neon')
  expect(getStarBalance()).toBe(7)
  expect(getUnlocks()).toEqual(['steampunk', 'penguin', 'neon'])
  expect(getSelected()).toBe('neon')
  addStars()
  expect(getStarBalance()).toBe(8)
  expect(getUnlocks()).toContain('neon')
})
it('does not charge again for an owned character', () => {
  buyCharacter('neon')
  buyCharacter('neon')
  expect(getStarBalance()).toBe(2)
})
it('uses the current persisted balance, and rejects locked or unknown selections', () => {
  localStorage.setItem(STAR_CURRENCY_KEY, '0')
  expect(() => buyCharacter('neon')).toThrow(/星星不足/)
  expect(() => selectCharacter('neon')).toThrow(/先解锁/)
  expect(() => buyCharacter('unknown')).toThrow()
  expect(getStarBalance()).toBe(0)
})
it('preserves the whole save when storage runs out of space', () => {
  buyCharacter('neon')
  const before = localStorage.getItem(LEGACY_PROFILE_KEY)
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  expect(() => buyCharacter('penguin')).toThrow('quota')
  expect(localStorage.getItem(LEGACY_PROFILE_KEY)).toBe(before)
  expect(getStarBalance()).toBe(2)
  expect(getSelected()).toBe('neon')
})
it('recovers malformed saves and never equips an unowned character', () => {
  localStorage.setItem(STAR_CURRENCY_KEY, '7')
  localStorage.setItem(LEGACY_PROFILE_KEY, '{broken')
  expect(getStarBalance()).toBe(7)
  localStorage.setItem(LEGACY_PROFILE_KEY, '{"stars":0,"unlocks":[],"selected":"neon"}')
  expect(loadLegacyProfile()).toEqual({ stars: 0, unlocks: ['steampunk'], selected: 'steampunk' })
})
