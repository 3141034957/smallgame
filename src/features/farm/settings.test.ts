import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFarmSettings, saveFarmSettings, FARM_SETTINGS_KEY } from './settings'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } })
})
afterEach(() => vi.unstubAllGlobals())

describe('farm display settings', () => {
  it('keeps effects on by default and remembers turning them off', () => {
    expect(loadFarmSettings()).toEqual({ effects: true })
    expect(saveFarmSettings({ effects: false })).toEqual({ effects: false })
    expect(loadFarmSettings()).toEqual({ effects: false })
    expect(saveFarmSettings({ effects: true })).toEqual({ effects: true })
    expect(loadFarmSettings().effects).toBe(true)
  })
  it('treats corrupt or missing storage as the default', () => {
    data.set(FARM_SETTINGS_KEY, '{broken')
    expect(loadFarmSettings().effects).toBe(true)
    data.set(FARM_SETTINGS_KEY, JSON.stringify({ effects: 'no' }))
    expect(loadFarmSettings().effects).toBe(true)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota') } })
    expect(saveFarmSettings({ effects: false })).toEqual({ effects: false })
  })
})
