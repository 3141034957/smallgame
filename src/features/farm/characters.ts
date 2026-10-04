import { CHARACTERS, DEFAULT_CHARACTER_ID } from '../shop/catalog'

const prices: Record<string, number> = { steampunk: 0, default: 600, 'burger-dog': 1200, neon: 1800, shadow: 2400, penguin: 3000, golden: 3600 }
const descriptions: Record<string, string> = {
  steampunk: '举杯开场，优雅地穿过每一波怪潮。',
  default: '给每一次冒险，一个充满能量的拥抱。',
  'burger-dog': '快乐加倍，带着满满元气奔向舞台。',
  neon: '跟着自己的节拍，唱出最特别的声音。',
  shadow: '聚光灯亮起，今天轮到你拯救舞台。',
  penguin: '披上勇气出发，把每一场战斗变成演出。',
  golden: '刀盾在手，为你的乐队守住最后一拍。',
}
export const FARM_CHARACTERS = CHARACTERS.map((character) => ({ ...character, price: prices[character.id], desc: descriptions[character.id] }))
export const FARM_DEFAULT_CHARACTER = DEFAULT_CHARACTER_ID
export const FARM_PROFILE_KEY = 'farm-character-profile-v1'
export type FarmProfile = { coins: number; owned: string[]; selected: string; rewardedRuns: string[] }
export type ProfileResult = { profile: FarmProfile; error?: string }
const validId = (id: unknown): id is string => typeof id === 'string' && FARM_CHARACTERS.some((character) => character.id === id)
const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter(validId) : []
const defaults = (): FarmProfile => ({ coins: 0, owned: [FARM_DEFAULT_CHARACTER], selected: FARM_DEFAULT_CHARACTER, rewardedRuns: [] })
function readJSON(key: string) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}

export function loadFarmProfile(): FarmProfile {
  try {
    const stored = readJSON(FARM_PROFILE_KEY)
    // Honor characters already unlocked in the original project on this browser.
    const legacyOwned = ids(readJSON('character-unlocks-v1'))
    const owned = [...new Set([FARM_DEFAULT_CHARACTER, ...ids(stored?.owned), ...legacyOwned])]
    const candidate = stored?.selected ?? localStorage.getItem('character-selected-v1')
    return {
      coins: Number.isSafeInteger(stored?.coins) && stored.coins >= 0 ? stored.coins : 0,
      owned, selected: validId(candidate) && owned.includes(candidate) ? candidate : FARM_DEFAULT_CHARACTER,
      rewardedRuns: Array.isArray(stored?.rewardedRuns) ? stored.rewardedRuns.filter((id: unknown) => typeof id === 'string').slice(-64) : [],
    }
  } catch { return defaults() }
}

function saveProfile(profile: FarmProfile, previous: FarmProfile): ProfileResult {
  try {
    // Currency, ownership and selection are committed together, never partially.
    localStorage.setItem(FARM_PROFILE_KEY, JSON.stringify(profile))
    return { profile }
  } catch { return { profile: previous, error: '暂时无法保存，请允许浏览器存储后重试。' } }
}

export function selectFarmCharacter(id: string): ProfileResult {
  const profile = loadFarmProfile()
  const character = FARM_CHARACTERS.find((item) => item.id === id)
  if (!character) return { profile, error: '这个角色暂时无法使用。' }
  const owned = profile.owned.includes(id)
  if (!owned && profile.coins < character.price) return { profile, error: `还差 ${character.price - profile.coins} 金币，再去战斗一场吧。` }
  return saveProfile({ ...profile, coins: profile.coins - (owned ? 0 : character.price), owned: owned ? profile.owned : [...profile.owned, id], selected: id }, profile)
}

export function awardFarmCoins(runId: string, amount: number): ProfileResult {
  const profile = loadFarmProfile()
  if (profile.rewardedRuns.includes(runId)) return { profile }
  if (!runId || !Number.isSafeInteger(amount) || amount < 0) return { profile, error: '本局金币记录无效。' }
  return saveProfile({ ...profile, coins: Math.min(Number.MAX_SAFE_INTEGER, profile.coins + amount), rewardedRuns: [...profile.rewardedRuns, runId].slice(-64) }, profile)
}
