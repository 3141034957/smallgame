import { afterEach, expect, it, vi } from 'vitest'
import { loadBestScore, saveBestScore } from './localScores'

afterEach(() => vi.unstubAllGlobals())

it('ignores corrupt best scores while preserving valid records', () => {
  let saved = ''
  vi.stubGlobal('localStorage', {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value
    },
  })
  for (const value of ['Infinity', '-1', 'broken', '5.5']) {
    saved = value
    expect(loadBestScore('best')).toBe(0)
  }
  saveBestScore('best', 123)
  expect(loadBestScore('best')).toBe(123)
  saveBestScore('best', Infinity)
  expect(loadBestScore('best')).toBe(123)
})

it('keeps score loading and finishing playable without local storage', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  })
  expect(loadBestScore('best')).toBe(0)
  expect(() => saveBestScore('best', 123)).not.toThrow()
})
