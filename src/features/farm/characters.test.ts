import { accountStorage } from '@/utils/accountStorage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  awardFarmCoins,
  FARM_CHARACTERS,
  FARM_DEFAULT_CHARACTER,
  FARM_PROFILE_KEY,
  loadFarmProfile,
  resetFarmUpgrades,
  selectFarmCharacter,
} from './characters'
import { permanentPrice } from './permanent.mjs'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('survivor character shop', () => {
  it('maps the retired roster while preserving coins, selection and reward deduplication', () => {
    const retired = ['steampunk', 'default', 'burger-dog', 'neon', 'shadow', 'penguin', 'golden']
    accountStorage.setItem(
      FARM_PROFILE_KEY,
      JSON.stringify({
        coins: 2345,
        owned: retired,
        selected: 'shadow',
        rewardedRuns: ['old-round'],
      }),
    )
    const profile = loadFarmProfile()
    expect(profile.coins).toBe(2345)
    expect(profile.selected).toBe('robot-dj')
    expect(profile.owned).toHaveLength(7)
    expect(profile.owned).toEqual(
      expect.arrayContaining([
        'bear-drums',
        'cat-guitar',
        'crocodile-beat',
        'bird-vocals',
        'robot-dj',
        'rabbit-flute',
        'fox-sax',
      ]),
    )
    expect(awardFarmCoins('old-round', 500).profile.coins).toBe(2345)
    expect(selectFarmCharacter('robot-dj').profile.coins).toBe(2345)
  })
  it('also honors ownership saved by the original shop atomic profile', () => {
    data.set(
      'clockwork-player-profile-v1',
      JSON.stringify({ unlocks: ['neon'], selected: 'neon', stars: 2 }),
    )
    expect(loadFarmProfile().owned).toContain('bird-vocals')
    expect(selectFarmCharacter('bird-vocals').profile.coins).toBe(0)
  })
  it('provides nine characters and a free starter with no unexplained currency', () => {
    expect(FARM_CHARACTERS).toHaveLength(9)
    for (const character of FARM_CHARACTERS) expect(character.price).toBeGreaterThanOrEqual(0)
    expect(loadFarmProfile()).toEqual({
      coins: 0,
      owned: [FARM_DEFAULT_CHARACTER],
      selected: FARM_DEFAULT_CHARACTER,
      rewardedRuns: [],
    })
  })

  it('awards a round once, buys and equips a character, and never charges for switching owned characters', () => {
    const character = FARM_CHARACTERS.find((item) => item.id === 'crocodile-beat')!
    expect(awardFarmCoins('round-1', 1800).profile.coins).toBe(1800)
    expect(awardFarmCoins('round-1', 1800).profile.coins).toBe(1800)
    const purchased = selectFarmCharacter(character.id)
    expect(purchased.error).toBeUndefined()
    expect(purchased.profile.coins).toBe(1800 - character.price)
    expect(purchased.profile.selected).toBe(character.id)
    expect(loadFarmProfile()).toEqual(purchased.profile)
    selectFarmCharacter(FARM_DEFAULT_CHARACTER)
    expect(selectFarmCharacter(character.id).profile.coins).toBe(600)
    expect(loadFarmProfile().owned.filter((id) => id === character.id)).toHaveLength(1)
  })

  it('rejects insufficient funds, unknown characters and invalid rewards without deducting coins', () => {
    expect(selectFarmCharacter('fox-sax').error).toContain('还差')
    expect(selectFarmCharacter('missing').error).toBeTruthy()
    for (const amount of [-1, NaN, Infinity, 1.2])
      expect(awardFarmCoins('invalid', amount).error).toBeTruthy()
    expect(loadFarmProfile().coins).toBe(0)
    expect(loadFarmProfile().owned).toEqual([FARM_DEFAULT_CHARACTER])
  })

  it('imports original character ownership and rejects locked or missing selected characters', () => {
    data.set(
      'character-unlocks-v1',
      JSON.stringify(['crocodile-beat', 'missing', 'crocodile-beat']),
    )
    data.set('character-selected-v1', 'crocodile-beat')
    expect(loadFarmProfile()).toMatchObject({
      owned: [FARM_DEFAULT_CHARACTER, 'crocodile-beat'],
      selected: 'crocodile-beat',
    })
    expect(selectFarmCharacter('crocodile-beat').profile.coins).toBe(0)
    accountStorage.setItem(
      FARM_PROFILE_KEY,
      JSON.stringify({ coins: 42, selected: 'fox-sax', owned: ['missing'], rewardedRuns: null }),
    )
    expect(loadFarmProfile()).toMatchObject({ coins: 42, selected: FARM_DEFAULT_CHARACTER })
  })

  it('refunds the steps a save actually owns when the spend ledger is missing or short', () => {
    // 旧档（某项 > 1 级）折算成链前 N 个节点：账本按已购节点重建，不是凭空返还。
    accountStorage.setItem(
      FARM_PROFILE_KEY,
      JSON.stringify({ coins: 100, growth: { levels: { regen: 2 } } }),
    )
    expect(loadFarmProfile().growth!.levels['step-1']).toBe(1)
    expect(loadFarmProfile().growth?.spent).toBe(permanentPrice('step-1', 0))
    const legacy = resetFarmUpgrades()
    expect(legacy.error).toBeUndefined()
    expect(legacy.profile.coins).toBe(100 + permanentPrice('step-1', 0)!)
    expect(legacy.profile.growth).toEqual(
      expect.objectContaining({ spent: 0, levels: expect.objectContaining({ 'step-1': 0 }) }),
    )
    // A damaged value is still sanitized to zero: it must not mint coins.
    accountStorage.setItem(
      FARM_PROFILE_KEY,
      JSON.stringify({
        coins: 7,
        growth: { levels: { 'step-1': 1, 'step-2': 1, 'step-3': 1 }, spent: -50 },
      }),
    )
    expect(loadFarmProfile().growth?.spent).toBe(0)
    expect(loadFarmProfile().growth!.levels['step-3']).toBe(1)
    expect(resetFarmUpgrades().profile.coins).toBe(7)
    expect(loadFarmProfile().growth!.levels['step-1']).toBe(0)
  })

  it('handles corrupt saves independently and does not report purchases as saved if storage fails', () => {
    awardFarmCoins('round-1', 1200)
    data.set('character-unlocks-v1', '{broken')
    expect(loadFarmProfile().coins).toBe(1200)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    const failed = selectFarmCharacter('crocodile-beat')
    expect(failed.error).toContain('无法保存')
    expect(failed.profile.coins).toBe(1200)
    expect(failed.profile.owned).not.toContain('crocodile-beat')
    expect(awardFarmCoins('round-2', 100).error).toContain('无法保存')
    expect(loadFarmProfile().coins).toBe(1200)
    data.set(FARM_PROFILE_KEY, '{broken')
    expect(loadFarmProfile().selected).toBe(FARM_DEFAULT_CHARACTER)
  })
})
