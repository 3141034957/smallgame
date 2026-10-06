import { accountStorage } from '@/utils/accountStorage'
import { BAND_CHARACTERS, DEFAULT_CHARACTER_ID, migrateCharacterId } from './characterRoster.mjs'
import {
  normalizePermanentLevels,
  permanentLevelCount,
  permanentPrice,
  type FarmGrowth,
  type PermanentId,
} from './permanent.mjs'

export const FARM_CHARACTERS = BAND_CHARACTERS.map(({ coinPrice, ...character }) => ({
  ...character,
  price: coinPrice,
  glow: character.color + '99',
}))
export const FARM_DEFAULT_CHARACTER = DEFAULT_CHARACTER_ID
export const FARM_PROFILE_KEY = 'farm-character-profile-v1'
export type FarmProfile = {
  coins: number
  owned: string[]
  selected: string
  rewardedRuns: string[]
  growth?: FarmGrowth
}
export type ProfileResult = { profile: FarmProfile; error?: string; paid: boolean }
const validId = (id: unknown): id is string =>
  typeof id === 'string' && FARM_CHARACTERS.some((character) => character.id === id)
const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(migrateCharacterId).filter(validId) : []
const defaults = (): FarmProfile => ({
  coins: 0,
  owned: [FARM_DEFAULT_CHARACTER],
  selected: FARM_DEFAULT_CHARACTER,
  rewardedRuns: [],
})
// Old saves predate the spend ledger, and a damaged one can lose it: the owned
// ranks themselves prove what was paid, so rebuild the cheapest possible total.
const permanentSpend = (levels: unknown) =>
  Object.entries(normalizePermanentLevels(levels)).reduce(
    (sum, [id, level]) =>
      sum +
      Array.from({ length: level }, (_, rank) => permanentPrice(id, rank) ?? 0).reduce(
        (total, price) => total + price,
        0,
      ),
    0,
  )
function readJSON(key: string) {
  try {
    return JSON.parse(accountStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

export function loadFarmProfile(): FarmProfile {
  try {
    const stored = readJSON(FARM_PROFILE_KEY)
    // Honor characters already unlocked in the original project on this browser.
    const legacy = readJSON('clockwork-player-profile-v1')
    const legacyOwned = [...ids(readJSON('character-unlocks-v1')), ...ids(legacy?.unlocks)]
    const owned = [...new Set([FARM_DEFAULT_CHARACTER, ...ids(stored?.owned), ...legacyOwned])]
    const candidate = migrateCharacterId(
      stored?.selected ?? accountStorage.getItem('character-selected-v1') ?? legacy?.selected,
    )
    return {
      coins: Number.isSafeInteger(stored?.coins) && stored.coins >= 0 ? stored.coins : 0,
      owned,
      selected:
        validId(candidate) && owned.includes(candidate) ? candidate : FARM_DEFAULT_CHARACTER,
      rewardedRuns: Array.isArray(stored?.rewardedRuns)
        ? stored.rewardedRuns.filter((id: unknown) => typeof id === 'string').slice(-64)
        : [],
      ...(stored?.growth
        ? {
            growth: {
              levels: normalizePermanentLevels(stored.growth.levels),
              spent:
                Number.isSafeInteger(stored.growth.spent) && stored.growth.spent >= 0
                  ? stored.growth.spent
                  : // Old saves predate the ledger: rebuild it from the ranks
                    // they own instead of refunding nothing. A damaged value
                    // stays at zero, so a hand-edited save cannot mint coins.
                    stored.growth.spent == null
                    ? permanentSpend(stored.growth.levels)
                    : 0,
            },
          }
        : {}),
    }
  } catch {
    return defaults()
  }
}

function saveProfile(profile: FarmProfile, previous: FarmProfile): ProfileResult {
  try {
    // Currency, ownership and selection are committed together, never partially.
    accountStorage.setItem(FARM_PROFILE_KEY, JSON.stringify(profile))
    return { profile, paid: true }
  } catch {
    return { profile: previous, error: '暂时无法保存，请允许浏览器存储后重试。', paid: false }
  }
}

export function selectFarmCharacter(id: string): ProfileResult {
  const profile = loadFarmProfile()
  const character = FARM_CHARACTERS.find((item) => item.id === id)
  if (!character) return { profile, error: '这个角色暂时无法使用。', paid: false }
  const owned = profile.owned.includes(id)
  if (!owned && profile.coins < character.price)
    return {
      profile,
      error: `还差 ${character.price - profile.coins} 金币，再去战斗一场吧。`,
      paid: false,
    }
  return saveProfile(
    {
      ...profile,
      coins: profile.coins - (owned ? 0 : character.price),
      owned: owned ? profile.owned : [...profile.owned, id],
      selected: id,
    },
    profile,
  )
}

export function awardFarmCoins(runId: string, amount: number): ProfileResult {
  const profile = loadFarmProfile()
  // paid=false keeps callers from announcing a reward that never landed.
  if (profile.rewardedRuns.includes(runId)) return { profile, paid: false }
  if (!runId || !Number.isSafeInteger(amount) || amount < 0)
    return { profile, error: '本局金币记录无效。', paid: false }
  return saveProfile(
    {
      ...profile,
      coins: Math.min(Number.MAX_SAFE_INTEGER, profile.coins + amount),
      rewardedRuns: [...profile.rewardedRuns, runId].slice(-64),
    },
    profile,
  )
}

export function buyFarmUpgrade(id: PermanentId, expectedLevel: number): ProfileResult {
  const profile = loadFarmProfile()
  const levels = normalizePermanentLevels(profile.growth?.levels)
  const price = permanentPrice(id, levels[id])
  if (levels[id] !== expectedLevel)
    return { profile, error: '强化等级已更新，请查看最新价格后重试。', paid: false }
  if (price === null) return { profile, error: '这项强化已满级或暂时无法使用。', paid: false }
  if (profile.coins < price)
    return { profile, error: `还差 ${price - profile.coins} 金币。`, paid: false }
  const spent = (profile.growth?.spent ?? 0) + price
  if (!Number.isSafeInteger(spent)) return { profile, error: '强化记录异常，请重试。', paid: false }
  return saveProfile(
    {
      ...profile,
      coins: profile.coins - price,
      growth: { levels: { ...levels, [id]: levels[id] + 1 }, spent },
    },
    profile,
  )
}

export function resetFarmUpgrades(): ProfileResult {
  const profile = loadFarmProfile()
  if (!permanentLevelCount(profile.growth?.levels)) return { profile, paid: false }
  const coins = profile.coins + (profile.growth?.spent ?? 0)
  if (!Number.isSafeInteger(coins))
    return { profile, error: '金币记录异常，无法重置。', paid: false }
  return saveProfile(
    { ...profile, coins, growth: { levels: normalizePermanentLevels(), spent: 0 } },
    profile,
  )
}
