import { beforeEach, describe, expect, it } from 'vitest'
import { emptyBoard, plantSeed } from './engine'
import type { Board, SeedKind } from './engine'
import {
  dailyStreak,
  readCollection,
  readDailyBest,
  readDailyProgress,
  readMuted,
  readSkin,
  readStoryProgress,
  recentDailyBest,
  removeFromCollection,
  renameSong,
  saveToCollection,
  shiftDate,
  writeDailyBest,
  writeDailyProgress,
  writeMuted,
  writeSkin,
  writeStoryProgress,
} from './storage'

function installStorage(): Map<string, string> {
  const map = new Map<string, string>()
  const stub = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    configurable: true,
    writable: true,
  })
  return map
}

function boardWith(...slots: [number, SeedKind][]): Board {
  return slots.reduce((board, [index, kind]) => plantSeed(board, index, kind), emptyBoard())
}

describe('date helpers', () => {
  it('shifts a date across month boundaries', () => {
    expect(shiftDate('2026-09-24', 7)).toBe('2026-10-01')
    expect(shiftDate('2026-10-01', -7)).toBe('2026-09-24')
    expect(shiftDate('2026-09-24', 0)).toBe('2026-09-24')
  })
})

describe('saved song collection', () => {
  let map: Map<string, string>
  beforeEach(() => {
    map = installStorage()
  })

  it('starts empty, then keeps the newest song first without duplicates', () => {
    expect(readCollection()).toEqual([])

    const first = saveToCollection(boardWith([0, 'heart'], [4, 'heart']))
    expect(first.added).toBe(true)
    expect(first.title).toBe('花房 1')
    expect(readCollection().map((song) => song.code)).toEqual(['H...H...'])

    const second = saveToCollection(boardWith([0, 'heart']))
    expect(second.title).toBe('花房 2')
    expect(readCollection().map((song) => song.title)).toEqual(['花房 2', '花房 1'])

    const again = saveToCollection(boardWith([0, 'heart'], [4, 'heart']))
    expect(again.added).toBe(false)
    expect(readCollection()).toHaveLength(2)
  })

  it('renames a song and ignores blank or unchanged names', () => {
    saveToCollection(boardWith([0, 'heart'], [4, 'heart']))
    const code = 'H...H...'
    expect(renameSong(code, '  雨夜  花房  ')?.at(0)?.title).toBe('雨夜 花房')
    expect(renameSong(code, '雨夜 花房')?.at(0)?.title).toBe('雨夜 花房')
    expect(renameSong(code, '   ')).toEqual(readCollection())
    expect(renameSong('nope', 'x')).toEqual(readCollection())
  })

  it('does not reuse a title after the newest song is removed', () => {
    saveToCollection(boardWith([0, 'heart'], [4, 'heart']))
    saveToCollection(boardWith([0, 'bell']))
    removeFromCollection('H...H...')
    expect(saveToCollection(boardWith([0, 'rain'])).title).toBe('花房 3')
  })

  it('adopts the song from the older single-slot key', () => {
    map.set('echo-garden-last-song-v1', 'H...H...')
    expect(readCollection().map((song) => song.code)).toEqual(['H...H...'])
    expect(map.get('echo-garden-collection-v1')).toContain('H...H...')
  })

  it('ignores a corrupted list instead of throwing', () => {
    map.set('echo-garden-collection-v1', '{not json')
    expect(readCollection()).toEqual([])
  })
})

describe('preferences', () => {
  beforeEach(() => {
    installStorage()
  })

  it('remembers the skin and mute state, defaulting to night and unmuted', () => {
    expect(readSkin()).toBe('night')
    expect(readMuted()).toBe(false)
    writeSkin('print')
    writeMuted(true)
    expect(readSkin()).toBe('print')
    expect(readMuted()).toBe(true)
    writeSkin('night')
    expect(readSkin()).toBe('night')
  })
})

describe('story progress', () => {
  beforeEach(() => {
    installStorage()
  })

  it('round trips a board and chapter, and rejects impossible chapters', () => {
    expect(readStoryProgress()).toBeNull()
    writeStoryProgress(boardWith([0, 'heart'], [4, 'heart']), 1)
    expect(readStoryProgress()).toEqual({
      board: boardWith([0, 'heart'], [4, 'heart']),
      chapter: 1,
    })

    localStorage.setItem('echo-garden-story-v1', JSON.stringify({ code: 'H...H...', chapter: 99 }))
    expect(readStoryProgress()).toBeNull()
    localStorage.setItem('echo-garden-story-v1', JSON.stringify({ code: 'nope', chapter: 0 }))
    expect(readStoryProgress()).toBeNull()
  })
})

describe('daily flower scores', () => {
  beforeEach(() => {
    installStorage()
  })

  it('keeps the highest score for a date', () => {
    expect(readDailyBest('2026-09-24')).toBe(0)
    expect(writeDailyBest('2026-09-24', 120)).toBe(120)
    expect(writeDailyBest('2026-09-24', 90)).toBe(120)
    expect(readDailyBest('2026-09-25')).toBe(0)
  })

  it('restores an unfinished round only when the board matches the round', () => {
    writeDailyProgress('2026-09-24', boardWith([0, 'heart'], [1, 'rain']), 2)
    expect(readDailyProgress('2026-09-24')?.round).toBe(2)
    writeDailyProgress('2026-09-24', boardWith([0, 'heart']), 2)
    expect(readDailyProgress('2026-09-24')).toBeNull()
  })

  it('lists the last seven days oldest first', () => {
    writeDailyBest('2026-09-24', 100)
    writeDailyBest('2026-09-22', 80)
    const records = recentDailyBest('2026-09-24')
    expect(records).toHaveLength(7)
    expect(records.at(-1)).toEqual({ date: '2026-09-24', score: 100 })
    expect(records.filter((record) => record.score > 0).map((record) => record.date)).toEqual([
      '2026-09-22',
      '2026-09-24',
    ])
  })

  it('counts a streak of finished days and tolerates an unplayed today', () => {
    expect(dailyStreak('2026-09-24')).toBe(0)
    writeDailyBest('2026-09-24', 100)
    expect(dailyStreak('2026-09-24')).toBe(1)
    writeDailyBest('2026-09-23', 100)
    writeDailyBest('2026-09-22', 100)
    expect(dailyStreak('2026-09-24')).toBe(3)
    expect(dailyStreak('2026-09-25')).toBe(3)
    expect(dailyStreak('2026-09-27')).toBe(0)
  })
})
