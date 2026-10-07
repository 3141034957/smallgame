import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { testStorage } from '@/test/storage'
import {
  accountStorage,
  ACCOUNT_SAVE_EVENT,
  activateAccount,
  canClaimLegacyProgress,
  claimLegacyProgress,
  exportGuestProgress,
  GUEST_SAVE_KEY,
  isDailyBestKey,
  progressForCloud,
  resetGuestProgress,
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
  vi.restoreAllMocks()
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
it('never overwrites an established account save with legacy progress and keeps saving in memory when storage is full', () => {
  activateAccount(a)
  awardFarmCoins('account_run', 7000)
  localStorage.setItem(FARM_PROFILE_KEY, '{"coins":99999}')
  claimLegacyProgress(a)
  expect(loadFarmProfile().coins).toBe(7000)
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  // A rejected write falls back to memory, so the run keeps the purchase.
  const purchase = selectFarmCharacter('crocodile-beat')
  expect(purchase.paid).toBe(true)
  expect(loadFarmProfile().owned).toContain('crocodile-beat')
  expect(loadFarmProfile().coins).toBe(purchase.profile.coins)
  expect(() => claimLegacyProgress(b)).toThrow('full')
  expect(localStorage.getItem('farm-legacy-claim-v1')).toBeNull()
})
it('keeps saving in memory when localStorage refuses account writes', () => {
  const c = 'account_00000000-0000-4000-8000-000000000003'
  activateAccount(c)
  accountStorage.setItem('farm-career-v1', '{"runs":1}')
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  expect(() => accountStorage.setItem('farm-career-v1', '{"runs":2}')).not.toThrow()
  expect(accountStorage.getItem('farm-career-v1')).toBe('{"runs":2}')
})
it('quarantines an unreadable account save and accepts new writes', () => {
  activateAccount(b)
  localStorage.setItem(`farm-account-save-v1:${b}`, '{"coins":')
  expect(accountStorage.getItem('farm-career-v1')).toBeNull()
  expect(localStorage.getItem(`farm-account-save-v1:${b}:corrupt`)).toBe('{"coins":')
  expect(() => accountStorage.setItem('farm-career-v1', '{"runs":1}')).not.toThrow()
  expect(accountStorage.getItem('farm-career-v1')).toBe('{"runs":1}')
})
it('keeps guest keys that registration never uploaded', () => {
  localStorage.setItem(
    'farm-guest-save-v1',
    JSON.stringify({ 'farm-career-v1': '{"runs":3}', 'clockwork-player-id-v1': 'guest-id-1' }),
  )
  const transferred = exportGuestProgress()
  expect(Object.keys(transferred)).toEqual(['farm-career-v1'])
  resetGuestProgress(transferred)
  expect(JSON.parse(localStorage.getItem('farm-guest-save-v1')!)).toEqual({
    'clockwork-player-id-v1': 'guest-id-1',
  })
  expect(JSON.parse(localStorage.getItem('farm-guest-backup-v1')!)['farm-career-v1']).toBe(
    '{"runs":3}',
  )
})
it('announces guest writes so the open page and other tabs refresh', () => {
  const seen: string[] = []
  // This suite runs without a DOM, so stand in for the window the app uses.
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const listener = (event: Event) => seen.push(event.type)
  target.addEventListener(ACCOUNT_SAVE_EVENT, listener)
  try {
    accountStorage.setItem('farm-career-v1', '{"runs":2}')
  } finally {
    target.removeEventListener(ACCOUNT_SAVE_EVENT, listener)
  }
  // Guests have no cloud save: without this event a second tab never sees the
  // run that was just played.
  expect(seen).toEqual([ACCOUNT_SAVE_EVENT])
  expect(JSON.parse(localStorage.getItem(GUEST_SAVE_KEY)!)['farm-career-v1']).toBe('{"runs":2}')
  expect(isDailyBestKey(GUEST_SAVE_KEY)).toBe(false)
  expect(isDailyBestKey('farm-best-v8-recovery:2026-10-06')).toBe(true)
})
it('drops daily best scores older than the retention window before uploading', () => {
  const today = new Date().toISOString().slice(0, 10)
  expect(
    progressForCloud({
      'farm-best-v8-recovery:2020-01-01': '1',
      [`farm-best-v8-recovery:${today}`]: '2',
      'farm-career-v1': '{"runs":1}',
      'unrelated-secret': 'private',
    }),
  ).toEqual({ [`farm-best-v8-recovery:${today}`]: '2', 'farm-career-v1': '{"runs":1}' })
})
