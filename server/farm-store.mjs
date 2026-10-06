import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { normalizeCharacterId } from './identity.mjs'

// Retain the historical table name so existing adventure scores survive upgrades.
const ranking = `SELECT player_id, name, score, accuracy, max_combo, stars, seconds, character_id,
  ROW_NUMBER() OVER (ORDER BY score DESC, accuracy DESC, max_combo DESC, updated_at ASC, player_id ASC) AS rank
  FROM melody_scores WHERE song_id = ? AND difficulty = ?`

export function createFarmStore(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS melody_scores (
      player_id TEXT NOT NULL, song_id TEXT NOT NULL, difficulty TEXT NOT NULL, name TEXT NOT NULL,
      score INTEGER NOT NULL CHECK(score >= 0), accuracy INTEGER NOT NULL CHECK(accuracy BETWEEN 0 AND 10000),
      max_combo INTEGER NOT NULL CHECK(max_combo >= 0), stars INTEGER NOT NULL CHECK(stars BETWEEN 0 AND 3), updated_at INTEGER NOT NULL,
      PRIMARY KEY(player_id, song_id, difficulty)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_melody_ranking ON melody_scores(song_id, difficulty, score DESC, accuracy DESC, max_combo DESC, updated_at ASC);`)
  // Older databases predate the survival clock: add the column in place.
  const columns = db
    .prepare('PRAGMA table_info(melody_scores)')
    .all()
    .map((column) => column.name)
  if (!columns.includes('seconds'))
    db.exec('ALTER TABLE melody_scores ADD COLUMN seconds INTEGER NOT NULL DEFAULT 0')
  if (!columns.includes('character_id'))
    db.exec("ALTER TABLE melody_scores ADD COLUMN character_id TEXT NOT NULL DEFAULT ''")
  const upsert =
    db.prepare(`INSERT INTO melody_scores (player_id, song_id, difficulty, name, score, accuracy, max_combo, stars, seconds, character_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, song_id, difficulty) DO UPDATE SET name = excluded.name,
      score = excluded.score, accuracy = excluded.accuracy, max_combo = excluded.max_combo, stars = excluded.stars, seconds = excluded.seconds, character_id = excluded.character_id, updated_at = excluded.updated_at
    WHERE excluded.score > melody_scores.score
      OR (excluded.score = melody_scores.score AND excluded.accuracy > melody_scores.accuracy)
      OR (excluded.score = melody_scores.score AND excluded.accuracy = melody_scores.accuracy AND excluded.max_combo > melody_scores.max_combo)`)
  const toEntry = (row, playerId) =>
    row
      ? {
          rank: row.rank,
          name: row.name,
          score: row.score,
          accuracy: row.accuracy / 100,
          maxCombo: row.max_combo,
          stars: row.stars,
          seconds: row.seconds ?? 0,
          characterId: normalizeCharacterId(row.character_id),
          isYou: row.player_id === playerId,
        }
      : null
  return {
    submit(record, now = Date.now()) {
      upsert.run(
        record.playerId,
        record.songId,
        record.difficulty,
        record.name,
        record.score,
        record.accuracy,
        record.maxCombo,
        record.stars,
        Math.round(record.seconds ?? 0),
        record.characterId ?? '',
        now,
      )
      // Renaming a player should work even when this performance is below their best.
      db.prepare('UPDATE melody_scores SET name = ? WHERE player_id = ?').run(
        record.name,
        record.playerId,
      )
      return this.board(record.songId, record.difficulty, record.playerId)
    },
    board(songId, difficulty, playerId = null) {
      const rows = db.prepare(`SELECT * FROM (${ranking}) LIMIT 50`).all(songId, difficulty)
      const own = playerId
        ? db
            .prepare(`SELECT * FROM (${ranking}) WHERE player_id = ?`)
            .get(songId, difficulty, playerId)
        : null
      const total = db
        .prepare('SELECT COUNT(*) AS total FROM melody_scores WHERE song_id = ? AND difficulty = ?')
        .get(songId, difficulty).total
      return { data: rows.map((row) => toEntry(row, playerId)), own: toEntry(own, playerId), total }
    },
    boardAcrossDays(songPrefix, difficulty, playerId = null) {
      // Keep existing daily records and select each player's best full record.
      const allTimeRanking = `WITH personal AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id
          ORDER BY score DESC, accuracy DESC, max_combo DESC, updated_at ASC, song_id ASC) AS best
        FROM melody_scores WHERE song_id GLOB ? AND difficulty = ?
      ) SELECT *, ROW_NUMBER() OVER (
        ORDER BY score DESC, accuracy DESC, max_combo DESC, updated_at ASC, player_id ASC
      ) AS rank FROM personal WHERE best = 1`
      const pattern = `${songPrefix}????-??-??`
      const rows = db
        .prepare(`SELECT * FROM (${allTimeRanking}) ORDER BY rank LIMIT 50`)
        .all(pattern, difficulty)
      const own = playerId
        ? db
            .prepare(`SELECT * FROM (${allTimeRanking}) WHERE player_id = ?`)
            .get(pattern, difficulty, playerId)
        : null
      const total = db
        .prepare(
          'SELECT COUNT(DISTINCT player_id) AS total FROM melody_scores WHERE song_id GLOB ? AND difficulty = ?',
        )
        .get(pattern, difficulty).total
      return { data: rows.map((row) => toEntry(row, playerId)), own: toEntry(own, playerId), total }
    },
    close: () => db.close(),
  }
}
