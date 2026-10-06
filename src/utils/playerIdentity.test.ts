import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createCompatiblePlayerId,
  getOrCreatePlayerId,
  getStoredNickname,
  PLAYER_ID_STORAGE_KEY,
  saveNickname,
} from './playerIdentity'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

it('keeps valid identities and repairs ids the server would reject', () => {
  data.set(PLAYER_ID_STORAGE_KEY, 'existing-player-1')
  expect(getOrCreatePlayerId()).toBe('existing-player-1')
  data.set(PLAYER_ID_STORAGE_KEY, '../invalid')
  const repaired = getOrCreatePlayerId()
  expect(repaired).toMatch(/^[a-zA-Z0-9_-]{8,96}$/)
  expect(getOrCreatePlayerId()).toBe(repaired)
})
it('migrates a valid legacy player and nickname', () => {
  data.set('mochi-melody-player-v1', JSON.stringify({ id: 'melody-player-1', name: ' 小  猫 ' }))
  expect(getOrCreatePlayerId()).toBe('melody-player-1')
  expect(getStoredNickname()).toBe('小 猫')
  saveNickname('现在的名字')
  expect(getStoredNickname()).toBe('现在的名字')
})
it('survives corrupt legacy saves and unavailable storage', () => {
  data.set('mochi-melody-player-v1', '{invalid')
  expect(getOrCreatePlayerId()).toMatch(/^[a-zA-Z0-9_-]{8,96}$/)
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  })
  expect(getOrCreatePlayerId()).toMatch(/^[a-zA-Z0-9_-]{8,96}$/)
  expect(getStoredNickname()).toBe('')
  expect(saveNickname('小猫')).toBe('小猫')
})
it('creates compatible UUIDs on HTTP without randomUUID or crypto', () => {
  vi.stubGlobal('crypto', {
    randomUUID: () => {
      throw new Error('HTTP')
    },
    getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
  })
  expect(createCompatiblePlayerId()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  vi.stubGlobal('crypto', undefined)
  expect(createCompatiblePlayerId()).toMatch(/^[0-9a-f-]{36}$/)
})
it('normalizes nickname whitespace, control characters and maximum length', () => {
  expect(saveNickname(' 小\u0000  猫 ')).toBe('小 猫')
  expect(getStoredNickname()).toBe('小 猫')
  expect(saveNickname('a'.repeat(20))).toHaveLength(12)
})
