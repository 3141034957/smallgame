import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { awardFarmCoins, FARM_CHARACTERS, FARM_DEFAULT_CHARACTER, FARM_PROFILE_KEY, loadFarmProfile, selectFarmCharacter } from './characters'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } })
})
afterEach(() => vi.unstubAllGlobals())

describe('survivor character shop', () => {
  it('provides seven characters and a free starter with no unexplained currency', () => {
    expect(FARM_CHARACTERS).toHaveLength(7)
    for (const character of FARM_CHARACTERS) expect(character.price).toBeGreaterThanOrEqual(0)
    expect(loadFarmProfile()).toEqual({ coins: 0, owned: [FARM_DEFAULT_CHARACTER], selected: FARM_DEFAULT_CHARACTER, rewardedRuns: [] })
  })

  it('awards a round once, buys and equips a character, and never charges for switching owned characters', () => {
    const character = FARM_CHARACTERS.find((item) => item.id === 'burger-dog')!
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
    expect(selectFarmCharacter('golden').error).toContain('还差')
    expect(selectFarmCharacter('missing').error).toBeTruthy()
    for (const amount of [-1, NaN, Infinity, 1.2]) expect(awardFarmCoins('invalid', amount).error).toBeTruthy()
    expect(loadFarmProfile().coins).toBe(0)
    expect(loadFarmProfile().owned).toEqual([FARM_DEFAULT_CHARACTER])
  })

  it('imports original character ownership and rejects locked or missing selected characters', () => {
    data.set('character-unlocks-v1', JSON.stringify(['burger-dog', 'missing', 'burger-dog']))
    data.set('character-selected-v1', 'burger-dog')
    expect(loadFarmProfile()).toMatchObject({ owned: [FARM_DEFAULT_CHARACTER, 'burger-dog'], selected: 'burger-dog' })
    expect(selectFarmCharacter('burger-dog').profile.coins).toBe(0)
    data.set(FARM_PROFILE_KEY, JSON.stringify({ coins: 42, selected: 'golden', owned: ['missing'], rewardedRuns: null }))
    expect(loadFarmProfile()).toMatchObject({ coins: 42, selected: FARM_DEFAULT_CHARACTER })
  })

  it('handles corrupt saves independently and does not report purchases as saved if storage fails', () => {
    awardFarmCoins('round-1', 1200)
    data.set('character-unlocks-v1', '{broken')
    expect(loadFarmProfile().coins).toBe(1200)
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: () => { throw new Error('quota') } })
    const failed = selectFarmCharacter('burger-dog')
    expect(failed.error).toContain('无法保存')
    expect(failed.profile.coins).toBe(1200)
    expect(failed.profile.owned).not.toContain('burger-dog')
    expect(awardFarmCoins('round-2', 100).error).toContain('无法保存')
    expect(loadFarmProfile().coins).toBe(1200)
    data.set(FARM_PROFILE_KEY, '{broken')
    expect(loadFarmProfile().selected).toBe(FARM_DEFAULT_CHARACTER)
  })
})
