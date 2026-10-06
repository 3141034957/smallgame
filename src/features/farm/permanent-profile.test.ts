import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  awardFarmCoins,
  buyFarmUpgrade,
  FARM_PROFILE_KEY,
  loadFarmProfile,
  resetFarmUpgrades,
  selectFarmCharacter,
} from './characters'
import { testStorage } from '@/test/storage'
import { PERMANENT_UPGRADES } from './permanent.mjs'

beforeEach(() => vi.stubGlobal('localStorage', testStorage()))
afterEach(() => vi.unstubAllGlobals())

it('offers every branch immediately, shares the existing wallet and preserves growth when switching characters', () => {
  awardFarmCoins('first', 2000000)
  for (const item of PERMANENT_UPGRADES) expect(buyFarmUpgrade(item.id, 0).paid).toBe(true)
  const before = loadFarmProfile()
  const switched = selectFarmCharacter('cat-guitar').profile
  expect(switched.growth).toEqual(before.growth)
  expect(switched.coins).toBe(before.coins - 600)
  expect(awardFarmCoins('second', 100).profile.growth).toEqual(before.growth)
})

it('rejects stale purchases, insufficient coins, invalid ids and max levels without charging', () => {
  expect(buyFarmUpgrade('shield', 0).paid).toBe(false)
  awardFarmCoins('first', 2000000)
  const bought = buyFarmUpgrade('vitality', 0)
  expect(buyFarmUpgrade('vitality', 0).profile.coins).toBe(bought.profile.coins)
  expect(buyFarmUpgrade('missing' as never, 0).paid).toBe(false)
  for (let rank = 1; rank < 12; rank++) buyFarmUpgrade('vitality', rank)
  const full = loadFarmProfile()
  expect(buyFarmUpgrade('vitality', 12).paid).toBe(false)
  expect(loadFarmProfile()).toEqual(full)
})

it('refunds the actual ledger exactly once and keeps owned characters and rewarded runs', () => {
  awardFarmCoins('first', 8000)
  selectFarmCharacter('cat-guitar')
  buyFarmUpgrade('vitality', 0)
  buyFarmUpgrade('regen', 0)
  expect(loadFarmProfile().growth?.spent).toBe(5000)
  expect(resetFarmUpgrades().profile.coins).toBe(7400)
  expect(resetFarmUpgrades().paid).toBe(false)
  expect(loadFarmProfile()).toMatchObject({
    coins: 7400,
    selected: 'cat-guitar',
    rewardedRuns: ['first'],
  })
  expect(awardFarmCoins('first', 8000).paid).toBe(false)
})

it('does not deduct coins or reset levels when storage fails', () => {
  awardFarmCoins('first', 10000)
  buyFarmUpgrade('vitality', 0)
  const before = loadFarmProfile()
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  expect(buyFarmUpgrade('vitality', 1).paid).toBe(false)
  expect(resetFarmUpgrades().paid).toBe(false)
  expect(loadFarmProfile()).toEqual(before)
})

it('defaults legacy saves to no upgrades and sanitizes damaged growth independently', () => {
  localStorage.setItem(
    FARM_PROFILE_KEY,
    JSON.stringify({
      coins: 1234,
      growth: { levels: { vitality: -1, shield: 100, regen: 2 }, spent: -50 },
    }),
  )
  const profile = loadFarmProfile()
  expect(profile.coins).toBe(1234)
  expect(profile.growth?.levels).toMatchObject({ vitality: 0, shield: 0, regen: 2 })
  expect(profile.growth?.spent).toBe(0)
  expect(resetFarmUpgrades().profile.coins).toBe(1234)
})
