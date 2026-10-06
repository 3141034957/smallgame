export const STAR_CURRENCY_KEY = 'clockwork-star-currency-v1'
export const INITIAL_STAR_BALANCE = 3

export function getStarBalance(): number {
  try {
    const raw = localStorage.getItem(STAR_CURRENCY_KEY)
    if (raw === null || !raw.trim()) return INITIAL_STAR_BALANCE
    const stored = Number(raw)
    return Number.isFinite(stored) && stored >= 0 ? Math.floor(stored) : INITIAL_STAR_BALANCE
  } catch {
    return INITIAL_STAR_BALANCE
  }
}

export function saveStarBalance(balance: number): number {
  if (!Number.isFinite(balance)) throw new RangeError('星星余额必须是有限数字')
  const nextBalance = Math.max(0, Math.floor(balance))
  localStorage.setItem(STAR_CURRENCY_KEY, String(nextBalance))
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
