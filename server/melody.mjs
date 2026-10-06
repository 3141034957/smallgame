import { DatabaseSync } from 'node:sqlite'
import {
  SONGS,
  DIFFICULTIES,
  makeChart,
  emptyRun,
  hitNote,
  advanceRun,
  runAccuracy,
  runStars,
} from '../src/features/melody/rules.mjs'
import { normalizePlayerId } from './leaderboard.mjs'

export function validBoard(songId, difficulty) {
  return (
    SONGS.some((song) => song.id === songId) && DIFFICULTIES.some((item) => item.id === difficulty)
  )
}

// Recalculate every tap, including wrong taps. Never trust a score supplied by the client.
export function verifyPerformance(input) {
  const playerId = normalizePlayerId(input?.playerId)
  const name =
    typeof input?.name === 'string'
      ? input.name
          .trim()
          .replace(/[\s\p{Cc}]+/gu, ' ')
          .slice(0, 12)
          .trim()
      : ''
  if (
    !playerId ||
    !name ||
    !validBoard(input.songId, input.difficulty) ||
    !Array.isArray(input.taps) ||
    input.taps.length > 1000
  )
    return null
  const song = SONGS.find((song) => song.id === input.songId)
  const notes = makeChart(song, input.difficulty)
  const duration = (song.beats * 60) / song.bpm
  let run = emptyRun()
  let previousTime = -Infinity
  for (const tap of input.taps) {
    if (
      !Number.isInteger(tap?.lane) ||
      tap.lane < 0 ||
      tap.lane > 3 ||
      !Number.isFinite(tap.time) ||
      tap.time < notes[0].time - 0.37 ||
      tap.time > duration + 0.15 ||
      tap.time < previousTime
    )
      return null
    previousTime = tap.time
    run = hitNote(run, notes, tap.lane, tap.time).run
  }
  run = advanceRun(run, notes, duration + 1)
  if (!Number.isInteger(input.score) || input.score !== run.score) return null
  return {
    playerId,
    name,
    songId: song.id,
    difficulty: input.difficulty,
    score: run.score,
    accuracy: Math.round(runAccuracy(run, notes.length) * 10000),
    maxCombo: run.maxCombo,
    stars: runStars(run, notes.length),
    seconds: 0,
  }
}

const ranking = `SELECT player_id, name, score, accuracy, max_combo, stars, seconds, character_id,
  ROW_NUMBER() OVER (ORDER BY score DESC, accuracy DESC, max_combo DESC, updated_at ASC, player_id ASC) AS rank
  FROM melody_scores WHERE song_id = ? AND difficulty = ?`

export function createMelodyStore(databasePath) {
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
          characterId: row.character_id ?? '',
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

export async function handleMelodyRequest(req, res, url, store) {
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/melody/leaderboard') {
      const songId = url.searchParams.get('song')
      const difficulty = url.searchParams.get('difficulty')
      if (!validBoard(songId, difficulty)) {
        send(400, { error: '请选择有效的曲目和难度。' })
        return
      }
      send(
        200,
        store.board(songId, difficulty, normalizePlayerId(url.searchParams.get('playerId'))),
      )
    } else if (req.method === 'POST' && url.pathname === '/api/melody/score') {
      let bytes = 0
      const chunks = []
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 65536) {
          send(413, { error: '演奏记录过大，请重新演出。' })
          return
        }
        chunks.push(chunk)
      }
      let input
      try {
        input = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        send(400, { error: '演奏记录格式错误。' })
        return
      }
      const record = verifyPerformance(input)
      if (!record) {
        send(400, { error: '演奏记录未通过校验，请重新演出后上榜。' })
        return
      }
      if (record.score === 0) {
        send(400, { error: '先接住一个音符，再来留下成绩吧 ♡' })
        return
      }
      send(200, { ...store.submit(record), acceptedScore: record.score })
    } else send(404, { error: '接口不存在。' })
  } catch (error) {
    console.error('Melody leaderboard error:', error)
    if (!res.headersSent) send(500, { error: '排行榜暂时忙碌，请稍后再试。' })
  }
}
