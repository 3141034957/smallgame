import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLeaderboardStore } from './database.mjs'

const temporaryDirectories = []

function createFixture({ leaderboard = [], stats = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'demogame-db-'))
  temporaryDirectories.push(directory)
  const paths = {
    databasePath: join(directory, 'game.db'),
    leaderboardPath: join(directory, 'leaderboard.json'),
    statsPath: join(directory, 'stats.json'),
  }
  writeFileSync(paths.leaderboardPath, JSON.stringify(leaderboard))
  writeFileSync(paths.statsPath, JSON.stringify(stats))
  return paths
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('SQLite leaderboard store', () => {
  it('imports and normalizes the legacy JSON data once', () => {
    const paths = createFixture({
      leaderboard: [
        { name: ' 小  猫 ', score: 100, time: 20 },
        { name: '小 猫', score: 120, time: 30 },
        { name: '无效', score: 600_000, time: 1 },
      ],
      stats: {
        scoreReportCount: 4,
        reporters: [
          { nickname: '小  猫', reportCount: 3 },
          { nickname: '小 猫', reportCount: 1 },
        ],
      },
    })

    const first = createLeaderboardStore(paths)
    expect(first.migration).toMatchObject({
      imported: true,
      leaderboardCount: 1,
      reporterCount: 1,
      scoreReportCount: 4,
    })
    expect(first.getLeaderboard()).toEqual([
      { rank: 1, name: '小 猫', score: 120 },
    ])
    expect(first.getStats()).toEqual({
      scoreReportCount: 4,
      submissionCount: 0,
      reporters: [{ nickname: '小 猫', reportCount: 4 }],
    })
    first.close()

    const reopened = createLeaderboardStore(paths)
    expect(reopened.migration).toMatchObject({ imported: false })
    expect(reopened.getStats().scoreReportCount).toBe(4)
    reopened.close()
  })

  it('records every valid submission and only replaces a higher best score', () => {
    const paths = createFixture({
      leaderboard: [{ name: '猫猫', score: 100, time: 10 }],
    })
    const store = createLeaderboardStore(paths)

    expect(store.submitScore('猫猫', 90, 20).becameBest).toBe(false)
    expect(store.submitScore('猫猫', 120, 30).becameBest).toBe(true)
    expect(store.submitScore('狗狗', 50, 40).becameBest).toBe(true)

    expect(store.getLeaderboard()).toEqual([
      { rank: 1, name: '猫猫', score: 120 },
      { rank: 2, name: '狗狗', score: 50 },
    ])
    expect(store.getStats()).toMatchObject({
      scoreReportCount: 3,
      submissionCount: 3,
      reporters: [
        { nickname: '猫猫', reportCount: 2 },
        { nickname: '狗狗', reportCount: 1 },
      ],
    })
    expect(store.getRecentSubmissions()).toEqual([
      expect.objectContaining({ nickname: '狗狗', score: 50, becameBest: true }),
      expect.objectContaining({ nickname: '猫猫', score: 120, becameBest: true }),
      expect.objectContaining({ nickname: '猫猫', score: 90, becameBest: false }),
    ])
    store.close()
  })
})
