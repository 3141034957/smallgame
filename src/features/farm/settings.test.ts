import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFarmSettings, saveFarmSettings, FARM_SETTINGS_KEY } from './settings'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('farm display settings', () => {
  it('keeps effects on by default and remembers turning them off', () => {
    expect(loadFarmSettings()).toEqual({ effects: true, muted: false })
    expect(saveFarmSettings({ effects: false })).toEqual({ effects: false, muted: false })
    expect(loadFarmSettings()).toEqual({ effects: false, muted: false })
    expect(saveFarmSettings({ effects: true })).toEqual({ effects: true, muted: false })
    expect(loadFarmSettings().effects).toBe(true)
  })
  it('treats corrupt or missing storage as the default', () => {
    data.set(FARM_SETTINGS_KEY, '{broken')
    expect(loadFarmSettings().effects).toBe(true)
    data.set(FARM_SETTINGS_KEY, JSON.stringify({ effects: 'no' }))
    expect(loadFarmSettings().effects).toBe(true)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(saveFarmSettings({ effects: false })).toEqual({ effects: false, muted: false })
  })
  it('keeps sound and effects choices independent across reloads', () => {
    saveFarmSettings({ muted: true })
    expect(saveFarmSettings({ effects: false })).toEqual({ effects: false, muted: true })
    expect(loadFarmSettings()).toEqual({ effects: false, muted: true })
    expect(saveFarmSettings({ muted: false })).toEqual({ effects: false, muted: false })
  })
  it('migrates an old effects-only setting and ignores invalid mute values', () => {
    data.set(FARM_SETTINGS_KEY, JSON.stringify({ effects: false }))
    expect(loadFarmSettings()).toEqual({ effects: false, muted: false })
    data.set(FARM_SETTINGS_KEY, JSON.stringify({ muted: 'true' }))
    expect(loadFarmSettings().muted).toBe(false)
  })
})
