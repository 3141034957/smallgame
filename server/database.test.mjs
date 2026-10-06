import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
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
        { name: '无效', score: 2_100_000, time: 1 },
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
      { rank: 1, characterId: 'burger-dog', name: '小 猫', score: 120 },
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

  it('records every character and only replaces a higher best score', () => {
    const paths = createFixture()
    const store = createLeaderboardStore(paths)
    const catPlayerId = 'player-cat-0001'
    const dogPlayerId = 'player-dog-0001'

    expect(store.submitScore(catPlayerId, '猫猫', 100, 'burger-dog', 10).becameBest).toBe(true)
    expect(store.submitScore(catPlayerId, '猫猫', 90, 'neon', 20).becameBest).toBe(false)
    expect(store.getLeaderboard()[0]).toMatchObject({
      characterId: 'neon',
      name: '猫猫',
      score: 100,
    })
    expect(store.submitScore(catPlayerId, '猫猫', 120, 'golden', 30).becameBest).toBe(true)
    expect(store.submitScore(catPlayerId, '猫猫', 110, 'penguin', 35).becameBest).toBe(false)
    expect(store.submitScore(dogPlayerId, '狗狗', 50, 'shadow', 40, '203.0.113.8').becameBest).toBe(
      true,
    )

    expect(store.getLeaderboard()).toEqual([
      { rank: 1, characterId: 'penguin', name: '猫猫', score: 120 },
      { rank: 2, characterId: 'shadow', name: '狗狗', score: 50 },
    ])
    expect(store.getStats()).toMatchObject({
      scoreReportCount: 5,
      submissionCount: 5,
      reporters: [
        { nickname: '猫猫', reportCount: 4 },
        { nickname: '狗狗', reportCount: 1 },
      ],
    })
    expect(store.getRecentSubmissions()).toEqual([
      expect.objectContaining({
        nickname: '狗狗',
        score: 50,
        characterId: 'shadow',
        becameBest: true,
      }),
      expect.objectContaining({
        nickname: '猫猫',
        score: 110,
        characterId: 'penguin',
        becameBest: false,
      }),
      expect.objectContaining({
        nickname: '猫猫',
        score: 120,
        characterId: 'golden',
        becameBest: true,
      }),
      expect.objectContaining({
        nickname: '猫猫',
        score: 90,
        characterId: 'neon',
        becameBest: false,
      }),
      expect.objectContaining({
        nickname: '猫猫',
        score: 100,
        characterId: 'burger-dog',
        becameBest: true,
      }),
    ])
    expect(store.getSubmissionsInRange(20, 36)).toHaveLength(3)
    expect(store.getSubmissionsInRange(20, 36)[0]).toEqual(
      expect.objectContaining({ nickname: '猫猫', score: 110, clientIp: null }),
    )
    expect(store.getSubmissionsInRange(40, 41)[0]).toEqual(
      expect.objectContaining({ nickname: '狗狗', clientIp: '203.0.113.8' }),
    )
    expect(store.getReporterCountsInRange(20, 41)).toEqual([
      { nickname: '猫猫', reportCount: 3 },
      { nickname: '狗狗', reportCount: 1 },
    ])
    store.close()
  })

  it('keeps duplicate nicknames by player ID but shows only the highest one', () => {
    const paths = createFixture()
    const store = createLeaderboardStore(paths)

    store.submitScore('duplicate-0001', '同名玩家', 200, 'neon', 10)
    store.submitScore('duplicate-0002', '同名玩家', 300, 'golden', 20)
    expect(store.getLeaderboard()).toEqual([
      { rank: 1, characterId: 'golden', name: '同名玩家', score: 300 },
    ])

    store.submitScore('duplicate-0001', '同名玩家', 400, 'shadow', 30)
    expect(store.getLeaderboard()).toEqual([
      { rank: 1, characterId: 'shadow', name: '同名玩家', score: 400 },
    ])
    expect(store.getRecentSubmissions()).toHaveLength(3)
    store.close()
  })

  it('adds character columns to an existing database without changing old rows', () => {
    const paths = createFixture()
    const legacyDatabase = new DatabaseSync(paths.databasePath)
    legacyDatabase.exec(`
      CREATE TABLE leaderboard (
        name TEXT PRIMARY KEY NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 0 AND score <= 500000),
        updated_at INTEGER NOT NULL
      ) STRICT;
      INSERT INTO leaderboard (name, score, updated_at)
      VALUES ('旧玩家', 321, 10);

      CREATE TABLE score_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL,
        submitted_score INTEGER NOT NULL CHECK (
          submitted_score >= 0 AND submitted_score <= 500000
        ),
        became_best INTEGER NOT NULL,
        submitted_at INTEGER NOT NULL
      ) STRICT;
    `)
    legacyDatabase.close()

    const store = createLeaderboardStore(paths)
    expect(store.getLeaderboard()).toEqual([
      { rank: 1, characterId: 'burger-dog', name: '旧玩家', score: 321 },
    ])
    expect(store.submitScore('new-player-0001', '新玩家', 123, 'penguin', 20).becameBest).toBe(true)
    expect(
      store.submitScore('million-player-0001', '百万玩家', 1_500_000, 'golden', 30).becameBest,
    ).toBe(true)
    expect(store.getLeaderboard()[0]).toMatchObject({
      name: '百万玩家',
      score: 1_500_000,
    })
    expect(store.getLeaderboard()[1]).toMatchObject({
      characterId: 'burger-dog',
      name: '旧玩家',
    })
    store.close()
  })
})
