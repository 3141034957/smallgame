import { loadLegacyProfile, saveLegacyProfile } from './legacyProfile'
export { STAR_CURRENCY_KEY, INITIAL_STAR_BALANCE } from './legacyProfile'

export function getStarBalance(): number {
  return loadLegacyProfile().stars
}

export function saveStarBalance(balance: number): number {
  if (!Number.isFinite(balance)) throw new RangeError('星星余额必须是有限数字')
  const nextBalance = Math.max(0, Math.floor(balance))
  saveLegacyProfile({ ...loadLegacyProfile(), stars: nextBalance })
  return nextBalance
}

export function addStars(amount = 1): number {
  const balance = getStarBalance()
  try {
    return saveStarBalance(balance + amount)
  } catch {
    return balance
  }
}
