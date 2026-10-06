import { expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createFarmStore } from './farm-store.mjs'
import { FARM_PREFIX, farmKey } from './farm.mjs'

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
    expect(store.boardAcrossDays(FARM_PREFIX, 'farm', 'farm_legacy_player').own).toMatchObject({
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
    expect(store.boardAcrossDays(FARM_PREFIX, 'farm').data[0]).toMatchObject({
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
