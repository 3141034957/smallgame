import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  addStars,
  getStarBalance,
  INITIAL_STAR_BALANCE,
  saveStarBalance,
  STAR_CURRENCY_KEY,
} from './starCurrency'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())
it('grants the initial balance only for missing or invalid saves, preserving zero', () => {
  expect(getStarBalance()).toBe(INITIAL_STAR_BALANCE)
  for (const value of ['', ' ', '-1', 'Infinity', 'broken']) {
    data.set(STAR_CURRENCY_KEY, value)
    expect(getStarBalance()).toBe(INITIAL_STAR_BALANCE)
  }
  data.set(STAR_CURRENCY_KEY, '0')
  expect(getStarBalance()).toBe(0)
})
it('stores and increments whole, nonnegative balances', () => {
  expect(saveStarBalance(4.9)).toBe(4)
  expect(addStars()).toBe(5)
  expect(getStarBalance()).toBe(5)
  expect(saveStarBalance(-2)).toBe(0)
})
it('rejects nonfinite balances without corrupting saved progress', () => {
  saveStarBalance(5)
  expect(() => saveStarBalance(NaN)).toThrow()
  expect(() => saveStarBalance(Infinity)).toThrow()
  expect(getStarBalance()).toBe(5)
})
it('keeps gameplay running when storage is blocked and never announces unsaved stars', () => {
  data.set(STAR_CURRENCY_KEY, '5')
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: () => {
      throw new Error('quota')
    },
  })
  expect(addStars()).toBe(5)
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked')
    },
  })
  expect(getStarBalance()).toBe(INITIAL_STAR_BALANCE)
})
