import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { testStorage } from '@/test/storage'
import {
  accountStorage,
  activateAccount,
  canClaimLegacyProgress,
  claimLegacyProgress,
} from './accountStorage'
import {
  loadFarmProfile,
  awardFarmCoins,
  selectFarmCharacter,
  FARM_PROFILE_KEY,
  FARM_DEFAULT_CHARACTER,
} from '@/features/farm/characters'
import { normalizePermanentLevels } from '@/features/farm/permanent.mjs'
import { getOrCreatePlayerId } from './playerIdentity'
const a = 'account_00000000-0000-4000-8000-000000000001'
const b = 'account_00000000-0000-4000-8000-000000000002'
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  activateAccount(null)
})
afterEach(() => {
  activateAccount(null)
  vi.unstubAllGlobals()
})
it('claims old coins, characters, upgrades, statistics and best scores exactly once without deleting originals', () => {
  const profile = {
    coins: 12000,
    owned: [FARM_DEFAULT_CHARACTER, 'crocodile-beat'],
    selected: 'crocodile-beat',
    rewardedRuns: ['old_run'],
    growth: { levels: normalizePermanentLevels({ regen: 3 }), spent: 52500 },
  }
  const source = JSON.stringify(profile)
  localStorage.setItem(FARM_PROFILE_KEY, source)
  localStorage.setItem('farm-best-v8-recovery:2026-10-06', '60000')
  localStorage.setItem('farm-career-v1', '{"runs":10}')
  expect(canClaimLegacyProgress()).toBe(true)
  claimLegacyProgress(a)
  activateAccount(a)
  expect(loadFarmProfile()).toEqual(profile)
  expect(accountStorage.getItem('farm-best-v8-recovery:2026-10-06')).toBe('60000')
  expect(accountStorage.getItem('farm-career-v1')).toBe('{"runs":10}')
  expect(getOrCreatePlayerId()).toBe(a)
  expect(awardFarmCoins('new_run', 100).profile.coins).toBe(12100)
  expect(localStorage.getItem(FARM_PROFILE_KEY)).toBe(source)
  claimLegacyProgress(b)
  activateAccount(b)
  expect(loadFarmProfile().coins).toBe(0)
  expect(accountStorage.getItem('farm-career-v1')).toBeNull()
  expect(getOrCreatePlayerId()).toBe(b)
  expect(canClaimLegacyProgress()).toBe(false)
  activateAccount(a)
  expect(loadFarmProfile().coins).toBe(12100)
})
it('isolates accounts and allows separate guest progress after logout', () => {
  activateAccount(a)
  for (const key of [
    'farm-quests-v1',
    'farm-achievements-v1',
    'farm-settings-v1',
    'clockwork-player-nickname-v1',
  ])
    accountStorage.setItem(key, 'a')
  activateAccount(b)
  for (const key of [
    'farm-quests-v1',
    'farm-achievements-v1',
    'farm-settings-v1',
    'clockwork-player-nickname-v1',
  ])
    expect(accountStorage.getItem(key)).toBeNull()
  activateAccount(null)
  accountStorage.setItem(FARM_PROFILE_KEY, 'guest')
  expect(accountStorage.getItem(FARM_PROFILE_KEY)).toBe('guest')
  activateAccount(a)
  expect(accountStorage.getItem(FARM_PROFILE_KEY)).toBeNull()
  expect(accountStorage.getItem('farm-quests-v1')).toBe('a')
  expect(localStorage.getItem(FARM_PROFILE_KEY)).toBeNull()
})
it('never overwrites an established account save with legacy progress and fails atomically when storage is full', () => {
  activateAccount(a)
  awardFarmCoins('account_run', 7000)
  localStorage.setItem(FARM_PROFILE_KEY, '{"coins":99999}')
  claimLegacyProgress(a)
  expect(loadFarmProfile().coins).toBe(7000)
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  expect(selectFarmCharacter('crocodile-beat').paid).toBe(false)
  expect(loadFarmProfile().coins).toBe(7000)
  expect(() => claimLegacyProgress(b)).toThrow('full')
  expect(localStorage.getItem('farm-legacy-claim-v1')).toBeNull()
})
