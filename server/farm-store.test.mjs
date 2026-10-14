import { expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createFarmStore } from './farm-store.mjs'
import { farmKey } from './farm.mjs'

it('persists distinct starts across restarts and preserves the first server timestamp', () => {
  const directory = mkdtempSync(join(tmpdir(), 'farm-starts-'))
  const path = join(directory, 'game.db')
  let store = createFarmStore(path)
  try {
    expect(store.countStarts()).toBe(0)
    expect(store.recordStart('farm_1791993600000_1_2', 100)).toBe(true)
    expect(store.recordStart('farm_1791993600000_1_2', 200)).toBe(false)
    store.close()
    store = createFarmStore(path)
    expect(store.countStarts()).toBe(1)
    expect(store.recordStart('farm_1791993600000_1_2', 300)).toBe(false)
    expect(store.recordStart('farm_1791993600000_3_4', 400)).toBe(true)
    expect(store.countStarts()).toBe(2)
    const inspection = new DatabaseSync(path, { readOnly: true })
    try {
      expect(inspection.prepare('SELECT * FROM farm_run_starts ORDER BY started_at').all()).toEqual(
        [
          { run_id: 'farm_1791993600000_1_2', started_at: 100 },
          { run_id: 'farm_1791993600000_3_4', started_at: 400 },
        ],
      )
    } finally {
      inspection.close()
    }
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('keeps the score write and the rename in one transaction, scoped to the submitted song', () => {
  const directory = mkdtempSync(join(tmpdir(), 'farm-tx-'))
  const store = createFarmStore(join(directory, 'game.db'))
  try {
    const base = {
      playerId: 'tx_player',
      difficulty: 'farm',
      name: '旧昵称',
      accuracy: 100,
      maxCombo: 1,
      stars: 0,
      seconds: 10,
      characterId: 'bear-drums',
    }
    store.submit({ ...base, songId: farmKey('2026-10-01'), score: 100 }, 100)
    // A rename on one day must not rewrite the player's other records.
    store.submit({ ...base, songId: farmKey('2026-10-02'), name: '新昵称', score: 200 }, 200)
    expect(store.board(farmKey('2026-10-01'), 'farm', 'tx_player').own.name).toBe('旧昵称')
    expect(store.board(farmKey('2026-10-02'), 'farm', 'tx_player').own.name).toBe('新昵称')
    // A rejected write must leave no partial row and no half-applied rename.
    expect(() =>
      store.submit(
        { ...base, songId: farmKey('2026-10-03'), name: '坏昵称', accuracy: 20000 },
        300,
      ),
    ).toThrow()
    expect(store.board(farmKey('2026-10-03'), 'farm').total).toBe(0)
    expect(store.board(farmKey('2026-10-01'), 'farm', 'tx_player').own.name).toBe('旧昵称')
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('migrates the deployed schema and preserves existing farm scores and avatars', () => {
  const directory = mkdtempSync(join(tmpdir(), 'farm-schema-'))
  const path = join(directory, 'game.db')
  let store
  try {
    const legacy = new DatabaseSync(path)
    legacy.exec(`CREATE TABLE melody_scores (
      player_id TEXT NOT NULL, song_id TEXT NOT NULL, difficulty TEXT NOT NULL, name TEXT NOT NULL,
      score INTEGER NOT NULL, accuracy INTEGER NOT NULL, max_combo INTEGER NOT NULL,
      stars INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(player_id, song_id, difficulty)
    ) STRICT;`)
    legacy
      .prepare('INSERT INTO melody_scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('farm_legacy_player', farmKey('2026-10-04'), 'farm', '老乐手', 5000, 3000, 40, 2, 1)
    legacy.close()
    store = createFarmStore(path)
    expect(store.boardAcrossDays('farm', 'farm_legacy_player').own).toMatchObject({
      name: '老乐手',
      score: 5000,
      seconds: 0,
      characterId: 'bear-drums',
      rank: 1,
    })
    store.submit(
      {
        playerId: 'farm_legacy_player',
        songId: farmKey('2026-10-04'),
        difficulty: 'farm',
        name: '新昵称',
        score: 4000,
        accuracy: 2000,
        maxCombo: 20,
        stars: 1,
        seconds: 100,
        characterId: 'bird-vocals',
      },
      2,
    )
    expect(store.boardAcrossDays('farm').data[0]).toMatchObject({
      name: '新昵称',
      score: 5000,
      seconds: 0,
    })
    const inspected = spawnSync(process.execPath, ['scripts/inspect-database.mjs', '2026-10-04'], {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: directory },
      encoding: 'utf8',
    })
    expect(inspected.status, inspected.stderr).toBe(0)
    expect(inspected.stdout).toContain('历史总榜（1 位玩家）')
    expect(inspected.stdout).toContain('2026-10-04 最佳成绩（1 位玩家）')
    expect(inspected.stdout).toContain('新昵称')
    const invalid = spawnSync(process.execPath, ['scripts/inspect-database.mjs', '2026-02-30'], {
      env: { ...process.env, DATA_DIR: directory },
      encoding: 'utf8',
    })
    expect(invalid.status).not.toBe(0)
    expect(invalid.stderr).toContain('日期无效')
  } finally {
    store?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('merges every ruleset into the all-time board and keeps one row per player', () => {
  const directory = mkdtempSync(join(tmpdir(), 'farm-rulesets-'))
  const store = createFarmStore(join(directory, 'game.db'))
  try {
    const base = {
      difficulty: 'farm',
      name: '乐手',
      accuracy: 100,
      maxCombo: 1,
      stars: 0,
      seconds: 10,
      characterId: 'bear-drums',
    }
    // Two rulesets on two days: both belong on the all-time board, while each
    // version keeps its own daily rows.
    store.submit(
      { ...base, playerId: 'v9_player', songId: 'farm:v9-boss-interval:2026-10-01', score: 700 },
      100,
    )
    store.submit(
      { ...base, playerId: 'v12_player', songId: 'farm:v12-echo-only:2026-10-02', score: 600 },
      200,
    )
    // One player on two versions and two days: only the best row survives.
    store.submit(
      { ...base, playerId: 'both_player', songId: 'farm:v9-boss-interval:2026-10-01', score: 500 },
      300,
    )
    store.submit(
      { ...base, playerId: 'both_player', songId: 'farm:v12-echo-only:2026-10-01', score: 900 },
      400,
    )
    store.submit(
      { ...base, playerId: 'both_player', songId: 'farm:v12-echo-only:2026-10-02', score: 800 },
      500,
    )
    const board = store.boardAcrossDays('farm', 'both_player')
    expect(board.total).toBe(3)
    expect(board.data.map((entry) => entry.score)).toEqual([900, 700, 600])
    expect(board.data.map((entry) => entry.ruleset)).toEqual([
      'v12-echo-only',
      'v9-boss-interval',
      'v12-echo-only',
    ])
    expect(board.own).toMatchObject({
      score: 900,
      rank: 1,
      ruleset: 'v12-echo-only',
      isYou: true,
    })
    // A daily board still belongs to one version only.
    expect(store.board('farm:v9-boss-interval:2026-10-01', 'farm').total).toBe(2)
    expect(store.board('farm:v12-echo-only:2026-10-01', 'farm').total).toBe(1)
    expect(store.board('farm:v12-echo-only:2026-10-02', 'farm').total).toBe(2)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
