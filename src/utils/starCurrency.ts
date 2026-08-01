export const STAR_CURRENCY_KEY = 'clockwork-star-currency-v1'
export const INITIAL_STAR_BALANCE = 3

export function getStarBalance(): number {
  const stored = Number(localStorage.getItem(STAR_CURRENCY_KEY))
  return Number.isFinite(stored) && stored >= 0
    ? Math.floor(stored)
    : INITIAL_STAR_BALANCE
}

export function saveStarBalance(balance: number): number {
  const nextBalance = Math.max(0, Math.floor(balance))
  localStorage.setItem(STAR_CURRENCY_KEY, String(nextBalance))
  return nextBalance
}

export function addStars(amount = 1): number {
  return saveStarBalance(getStarBalance() + amount)
}

export function resetStarBalance(): number {
  return saveStarBalance(INITIAL_STAR_BALANCE)
}
