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
import { PERMANENT_TOTAL_LEVELS, PERMANENT_UPGRADES, permanentLevelCount } from './permanent.mjs'

beforeEach(() => vi.stubGlobal('localStorage', testStorage()))
afterEach(() => vi.unstubAllGlobals())

it('sells the chain one step at a time, shares the existing wallet and preserves growth when switching characters', () => {
  awardFarmCoins('first', 2000000)
  // 链只能按顺序解锁：跳步购买被拒绝，且不扣币。
  const skipped = buyFarmUpgrade('step-3', 0)
  expect(skipped.paid).toBe(false)
  expect(skipped.error).toBe('前面的强化还没升级。')
  expect(skipped.profile.coins).toBe(2000000)
  for (const item of PERMANENT_UPGRADES) {
    const bought = buyFarmUpgrade(item.id, 0)
    expect(bought.paid).toBe(true)
    expect(bought.profile.growth!.levels[item.id]).toBe(1)
  }
  expect(permanentLevelCount(loadFarmProfile().growth?.levels)).toBe(PERMANENT_TOTAL_LEVELS)
  // 全部买完后没有下一个节点，再买同样不成交。
  expect(buyFarmUpgrade('step-29', 0).paid).toBe(false)
  const before = loadFarmProfile()
  const switched = selectFarmCharacter('cat-guitar').profile
  expect(switched.growth).toEqual(before.growth)
  expect(switched.coins).toBe(before.coins - 600)
  expect(awardFarmCoins('second', 100).profile.growth).toEqual(before.growth)
})

it('rejects stale purchases, insufficient coins, invalid ids and owned steps without charging', () => {
  // 余额不足：不扣币，也不动等级。
  const broke = buyFarmUpgrade('step-1', 0)
  expect(broke.paid).toBe(false)
  expect(broke.error).toContain('还差')
  awardFarmCoins('first', 2000000)
  const bought = buyFarmUpgrade('step-1', 0)
  expect(bought.paid).toBe(true)
  // 等级已更新：拿着旧价格重复提交不扣币（防重复扣款）。
  const stale = buyFarmUpgrade('step-1', 0)
  expect(stale.paid).toBe(false)
  expect(stale.profile.coins).toBe(bought.profile.coins)
  expect(buyFarmUpgrade('missing' as never, 0).paid).toBe(false)
  // 单级节点买过即满级：再取价返回 null。
  expect(buyFarmUpgrade('step-1', 1).paid).toBe(false)
  const snapshot = loadFarmProfile()
  expect(buyFarmUpgrade('step-1', 2).paid).toBe(false)
  expect(loadFarmProfile()).toEqual(snapshot)
})

it('refunds the actual ledger exactly once and keeps owned characters and rewarded runs', () => {
  awardFarmCoins('first', 8000)
  selectFarmCharacter('cat-guitar')
  const [first, second] = PERMANENT_UPGRADES
  expect(buyFarmUpgrade(first.id, 0).paid).toBe(true)
  expect(buyFarmUpgrade(second.id, 0).paid).toBe(true)
  expect(loadFarmProfile().growth?.spent).toBe(first.price + second.price)
  expect(resetFarmUpgrades().profile.coins).toBe(7400)
  expect(resetFarmUpgrades().paid).toBe(false)
  expect(loadFarmProfile()).toMatchObject({
    coins: 7400,
    selected: 'cat-guitar',
    rewardedRuns: ['first'],
  })
  expect(loadFarmProfile().growth).toEqual(
    expect.objectContaining({ spent: 0, levels: expect.objectContaining({ 'step-1': 0 }) }),
  )
  expect(awardFarmCoins('first', 8000).paid).toBe(false)
})

it('does not deduct coins or reset levels when storage fails', () => {
  awardFarmCoins('first', 10000)
  buyFarmUpgrade('step-1', 0)
  const before = loadFarmProfile()
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  expect(buyFarmUpgrade('step-2', 0).paid).toBe(false)
  expect(resetFarmUpgrades().paid).toBe(false)
  expect(loadFarmProfile()).toEqual(before)
})

it('migrates a legacy multi-level save into a chain prefix and sanitizes damaged growth independently', () => {
  localStorage.setItem(
    FARM_PROFILE_KEY,
    JSON.stringify({
      coins: 1234,
      growth: { levels: { vitality: 6, power: 9, shield: 1 }, spent: -50 },
    }),
  )
  const profile = loadFarmProfile()
  expect(profile.coins).toBe(1234)
  // vitality 6 → 3、power 9 → 3、shield 1 → 1：折算成链前 7 个节点。
  expect(permanentLevelCount(profile.growth?.levels)).toBe(7)
  expect(profile.growth!.levels['step-7']).toBe(1)
  expect(profile.growth!.levels['step-8']).toBe(0)
  // 账本损坏只归零，不凭空铸币。
  expect(profile.growth?.spent).toBe(0)
  expect(resetFarmUpgrades().profile.coins).toBe(1234)
  // 折算后为 0 的旧档不产出任何节点。
  localStorage.setItem(
    FARM_PROFILE_KEY,
    JSON.stringify({ coins: 42, growth: { levels: { vitality: -1, regen: 2 }, spent: -50 } }),
  )
  expect(permanentLevelCount(loadFarmProfile().growth?.levels)).toBe(0)
  expect(loadFarmProfile().growth?.spent).toBe(0)
})
