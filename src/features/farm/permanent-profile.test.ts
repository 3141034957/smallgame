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
  // 全链 200 步共 40,200,000，外加换角色的 600。
  const chainPrice = PERMANENT_UPGRADES.reduce((sum, item) => sum + item.price, 0)
  awardFarmCoins('first', chainPrice + 600)
  // 链只能按顺序解锁：跳步购买被拒绝，且不扣币。
  const skipped = buyFarmUpgrade('step-3', 0)
  expect(skipped.paid).toBe(false)
  expect(skipped.error).toBe('前面的强化还没升级。')
  expect(skipped.profile.coins).toBe(chainPrice + 600)
  for (const item of PERMANENT_UPGRADES) {
    const bought = buyFarmUpgrade(item.id, 0)
    expect(bought.paid).toBe(true)
    expect(bought.profile.growth!.levels[item.id]).toBe(1)
  }
  expect(permanentLevelCount(loadFarmProfile().growth?.levels)).toBe(PERMANENT_TOTAL_LEVELS)
  // 全部买完后没有下一个节点，再买同样不成交。
  expect(buyFarmUpgrade(PERMANENT_UPGRADES.at(-1)!.id, 0).paid).toBe(false)
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

const emptyLevels = Object.fromEntries(PERMANENT_UPGRADES.map((item) => [item.id, 0]))

it('clears a legacy multi-level save and never refunds coins it never charged', () => {
  // 旧档不折算：链上没有这些 id，读回来是空链，账本也一起归零。
  localStorage.setItem(
    FARM_PROFILE_KEY,
    JSON.stringify({
      coins: 1234,
      growth: { levels: { vitality: 12, power: 15, shield: 3 }, spent: -50 },
    }),
  )
  const profile = loadFarmProfile()
  expect(profile.coins).toBe(1234)
  expect(profile.growth).toEqual({ levels: emptyLevels, spent: 0 })
  expect(permanentLevelCount(profile.growth?.levels)).toBe(0)
  // 没有已购节点：重置不成交，也就不会凭空返还金币。
  const reset = resetFarmUpgrades()
  expect(reset.paid).toBe(false)
  expect(reset.profile.coins).toBe(1234)
  expect(loadFarmProfile()).toMatchObject({
    coins: 1234,
    growth: { levels: emptyLevels, spent: 0 },
  })
})

it('rebuilds a missing or damaged ledger from the steps actually owned', () => {
  const [first, second] = PERMANENT_UPGRADES
  const owned = { ...emptyLevels, [first.id]: 1, [second.id]: 1 }
  const ledger = first.price + second.price
  // 缺失、负数、小数、null 都按已购节点的价格重建：不照抄损坏值，也不凭空造币。
  for (const spent of [undefined, -50, 1.5, null]) {
    // 每轮都用干净存档：重置过的档案会写进账号存档，之后 raw key 不再生效。
    localStorage.clear()
    localStorage.setItem(
      FARM_PROFILE_KEY,
      JSON.stringify({ coins: 100, growth: { levels: owned, spent } }),
    )
    expect(loadFarmProfile().growth).toEqual({ levels: owned, spent: ledger })
    // 返还的就是重建出来的账本：一次到位，之后再重置不再产出金币。
    const reset = resetFarmUpgrades()
    expect(reset.paid).toBe(true)
    expect(reset.profile.growth).toEqual({ levels: emptyLevels, spent: 0 })
    expect(reset.profile.coins).toBe(100 + ledger)
    expect(resetFarmUpgrades().paid).toBe(false)
  }
})
