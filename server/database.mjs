import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  createLegacyPlayerId,
  DEFAULT_CHARACTER_ID,
  MAX_SCORE,
  normalizeCharacterId,
  normalizeScoreInput,
  rankLeaderboardEntries,
} from './leaderboard.mjs'

const JSON_IMPORT_KEY = 'json_import_v1'

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8'))
}

function normalizeLegacyLeaderboard(records) {
  const bestByName = new Map()

  for (const entry of Array.isArray(records) ? records : []) {
    const input = normalizeScoreInput(entry)
    if (!input || input.score > MAX_SCORE) continue

    const updatedAt = Number.isSafeInteger(entry.time) && entry.time >= 0
      ? entry.time
      : 0
    const current = bestByName.get(input.name)
    if (
      !current ||
      input.score > current.score ||
      (input.score === current.score && updatedAt < current.updatedAt)
    ) {
      bestByName.set(input.name, {
        ...input,
        characterId: normalizeCharacterId(entry.characterId),
        updatedAt,
      })
    }
  }

  return [...bestByName.values()]
}

function normalizeLegacyStats(value) {
  const reportersByName = new Map()

  for (const reporter of Array.isArray(value?.reporters) ? value.reporters : []) {
    const input = normalizeScoreInput({ name: reporter?.nickname, score: 0 })
    if (
      !input ||
      !Number.isSafeInteger(reporter?.reportCount) ||
      reporter.reportCount < 0
    ) {
      continue
    }
    reportersByName.set(
      input.name,
      (reportersByName.get(input.name) ?? 0) + reporter.reportCount,
    )
  }

  const reporterTotal = [...reportersByName.values()]
    .reduce((total, count) => total + count, 0)
  const storedTotal = Number.isSafeInteger(value?.scoreReportCount) &&
    value.scoreReportCount >= 0
    ? value.scoreReportCount
    : 0

  return {
    scoreReportCount: Math.max(storedTotal, reporterTotal),
    reporters: [...reportersByName].map(([nickname, reportCount]) => ({
      nickname,
      reportCount,
    })),
  }
}

function hasCurrentScoreLimit(db, tableName, scoreColumn) {
  const schema = db.prepare(
    'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
  ).get('table', tableName)?.sql ?? ''

  return schema.includes(`${scoreColumn} <= ${MAX_SCORE}`)
}

function migratePlayerSchema(db) {
  const leaderboardColumns = db.prepare('PRAGMA table_info(leaderboard)').all()
  const submissionColumns = db.prepare(
    'PRAGMA table_info(score_submissions)',
  ).all()
  const leaderboardHasPlayerId = leaderboardColumns.some(
    (column) => column.name === 'player_id',
  )
  const submissionsHavePlayerId = submissionColumns.some(
    (column) => column.name === 'player_id',
  )
  const leaderboardIsCurrent = hasCurrentScoreLimit(
    db,
    'leaderboard',
    'score',
  )
  const submissionsAreCurrent = hasCurrentScoreLimit(
    db,
    'score_submissions',
    'submitted_score',
  )
  if (
    leaderboardHasPlayerId &&
    submissionsHavePlayerId &&
    leaderboardIsCurrent &&
    submissionsAreCurrent
  ) {
    return
  }

  const leaderboardPlayerId = leaderboardHasPlayerId
    ? 'player_id'
    : "'legacy:' || name"
  const submissionPlayerId = submissionsHavePlayerId
    ? 'player_id'
    : "'legacy:' || nickname"

  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`
      ALTER TABLE leaderboard RENAME TO leaderboard_score_limit_backup;
      ALTER TABLE score_submissions
        RENAME TO score_submissions_score_limit_backup;

      CREATE TABLE leaderboard (
        player_id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 0 AND score <= ${MAX_SCORE}),
        character_id TEXT NOT NULL DEFAULT '${DEFAULT_CHARACTER_ID}',
        updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
      ) STRICT;

      INSERT INTO leaderboard (
        player_id,
        name,
        score,
        character_id,
        updated_at
      )
      SELECT
        ${leaderboardPlayerId},
        name,
        score,
        character_id,
        updated_at
      FROM leaderboard_score_limit_backup;

      CREATE TABLE score_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        submitted_score INTEGER NOT NULL CHECK (
          submitted_score >= 0 AND submitted_score <= ${MAX_SCORE}
        ),
        character_id TEXT NOT NULL DEFAULT '${DEFAULT_CHARACTER_ID}',
        became_best INTEGER NOT NULL CHECK (became_best IN (0, 1)),
        submitted_at INTEGER NOT NULL CHECK (submitted_at >= 0)
      ) STRICT;

      INSERT INTO score_submissions (
        id,
        player_id,
        nickname,
        submitted_score,
        character_id,
        became_best,
        submitted_at
      )
      SELECT
        id,
        ${submissionPlayerId},
        nickname,
        submitted_score,
        character_id,
        became_best,
        submitted_at
      FROM score_submissions_score_limit_backup;

      DROP TABLE leaderboard_score_limit_backup;
      DROP TABLE score_submissions_score_limit_backup;

      CREATE INDEX idx_leaderboard_score
        ON leaderboard (score DESC, updated_at ASC, name ASC);
      CREATE INDEX idx_leaderboard_name_score
        ON leaderboard (name, score DESC, updated_at ASC, player_id ASC);
      CREATE INDEX idx_score_submissions_time
        ON score_submissions (submitted_at DESC, id DESC);
      CREATE INDEX idx_score_submissions_nickname
        ON score_submissions (nickname, submitted_at DESC);
    `)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS leaderboard (
      player_id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score >= 0 AND score <= ${MAX_SCORE}),
      character_id TEXT NOT NULL DEFAULT '${DEFAULT_CHARACTER_ID}',
      updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_leaderboard_score
      ON leaderboard (score DESC, updated_at ASC, name ASC);

    CREATE TABLE IF NOT EXISTS score_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      submitted_score INTEGER NOT NULL CHECK (
        submitted_score >= 0 AND submitted_score <= ${MAX_SCORE}
      ),
      character_id TEXT NOT NULL DEFAULT '${DEFAULT_CHARACTER_ID}',
      became_best INTEGER NOT NULL CHECK (became_best IN (0, 1)),
      submitted_at INTEGER NOT NULL CHECK (submitted_at >= 0)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_score_submissions_time
      ON score_submissions (submitted_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_score_submissions_nickname
      ON score_submissions (nickname, submitted_at DESC);

    CREATE TABLE IF NOT EXISTS score_reporters (
      nickname TEXT PRIMARY KEY NOT NULL,
      report_count INTEGER NOT NULL CHECK (report_count >= 0)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS app_stats (
      key TEXT PRIMARY KEY NOT NULL,
      value INTEGER NOT NULL CHECK (value >= 0)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    ) STRICT;
  `)

  const leaderboardColumns = db.prepare('PRAGMA table_info(leaderboard)').all()
  if (!leaderboardColumns.some((column) => column.name === 'character_id')) {
    db.exec(`
      ALTER TABLE leaderboard
      ADD COLUMN character_id TEXT NOT NULL DEFAULT '${DEFAULT_CHARACTER_ID}';
    `)
  }

  const submissionColumns = db.prepare(
    'PRAGMA table_info(score_submissions)',
  ).all()
  if (!submissionColumns.some((column) => column.name === 'character_id')) {
    db.exec(`
      ALTER TABLE score_submissions
      ADD COLUMN character_id TEXT NOT NULL DEFAULT '${DEFAULT_CHARACTER_ID}';
    `)
  }

  migratePlayerSchema(db)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leaderboard_name_score
      ON leaderboard (name, score DESC, updated_at ASC, player_id ASC);
  `)
}

function importLegacyJson(db, leaderboardPath, statsPath) {
  const existingImport = db.prepare(
    'SELECT value FROM app_meta WHERE key = ?',
  ).get(JSON_IMPORT_KEY)
  if (existingImport) {
    return { imported: false, ...JSON.parse(existingImport.value) }
  }

  const leaderboard = normalizeLegacyLeaderboard(readJson(leaderboardPath, []))
  const stats = normalizeLegacyStats(readJson(statsPath, {}))
  const insertLeaderboard = db.prepare(`
    INSERT INTO leaderboard (
      player_id,
      name,
      score,
      character_id,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      name = excluded.name,
      score = excluded.score,
      character_id = excluded.character_id,
      updated_at = excluded.updated_at
    WHERE excluded.score > leaderboard.score
      OR (
        excluded.score = leaderboard.score
        AND excluded.updated_at < leaderboard.updated_at
      )
  `)
  const insertReporter = db.prepare(`
    INSERT INTO score_reporters (nickname, report_count)
    VALUES (?, ?)
    ON CONFLICT(nickname) DO UPDATE SET
      report_count = excluded.report_count
  `)
  const setStat = db.prepare(`
    INSERT INTO app_stats (key, value)
    VALUES ('score_report_count', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  const setMeta = db.prepare(
    'INSERT INTO app_meta (key, value) VALUES (?, ?)',
  )
  const migration = {
    importedAt: Date.now(),
    leaderboardCount: leaderboard.length,
    reporterCount: stats.reporters.length,
    scoreReportCount: stats.scoreReportCount,
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const entry of leaderboard) {
      insertLeaderboard.run(
        createLegacyPlayerId(entry.name),
        entry.name,
        entry.score,
        entry.characterId,
        entry.updatedAt,
      )
    }
    for (const reporter of stats.reporters) {
      insertReporter.run(reporter.nickname, reporter.reportCount)
    }
    setStat.run(stats.scoreReportCount)
    setMeta.run(JSON_IMPORT_KEY, JSON.stringify(migration))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return { imported: true, ...migration }
}

export function createLeaderboardStore({
  databasePath,
  leaderboardPath,
  statsPath,
}) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  initializeSchema(db)
  const migration = importLegacyJson(db, leaderboardPath, statsPath)

  const findBest = db.prepare(
    'SELECT score FROM leaderboard WHERE player_id = ?',
  )
  const insertSubmission = db.prepare(`
    INSERT INTO score_submissions (
      player_id,
      nickname,
      submitted_score,
      character_id,
      became_best,
      submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  const incrementReporter = db.prepare(`
    INSERT INTO score_reporters (nickname, report_count)
    VALUES (?, 1)
    ON CONFLICT(nickname) DO UPDATE SET
      report_count = report_count + 1
  `)
  const incrementTotal = db.prepare(`
    INSERT INTO app_stats (key, value)
    VALUES ('score_report_count', 1)
    ON CONFLICT(key) DO UPDATE SET value = value + 1
  `)
  const upsertLeaderboard = db.prepare(`
    INSERT INTO leaderboard (
      player_id,
      name,
      score,
      character_id,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      name = excluded.name,
      score = CASE
        WHEN excluded.score > leaderboard.score THEN excluded.score
        ELSE leaderboard.score
      END,
      character_id = excluded.character_id,
      updated_at = CASE
        WHEN excluded.score > leaderboard.score THEN excluded.updated_at
        ELSE leaderboard.updated_at
      END
  `)
  const selectLeaderboard = db.prepare(`
    WITH unique_names AS (
      SELECT
        player_id,
        name,
        score,
        character_id,
        updated_at,
        ROW_NUMBER() OVER (
          PARTITION BY name
          ORDER BY score DESC, updated_at ASC, player_id ASC
        ) AS nickname_rank
      FROM leaderboard
    )
    SELECT
      name,
      score,
      character_id AS characterId,
      updated_at AS updatedAt
    FROM unique_names
    WHERE nickname_rank = 1
    ORDER BY score DESC, updated_at ASC, name ASC
    LIMIT 100
  `)
  const selectTotal = db.prepare(`
    SELECT value
    FROM app_stats
    WHERE key = 'score_report_count'
  `)
  const selectReporters = db.prepare(`
    SELECT nickname, report_count AS reportCount
    FROM score_reporters
    ORDER BY report_count DESC, nickname ASC
  `)
  const selectSubmissionCount = db.prepare(
    'SELECT COUNT(*) AS count FROM score_submissions',
  )
  const selectSubmissionsInRange = db.prepare(`
    SELECT
      id,
      player_id AS playerId,
      nickname,
      submitted_score AS score,
      character_id AS characterId,
      became_best AS becameBest,
      submitted_at AS submittedAt
    FROM score_submissions
    WHERE submitted_at >= ? AND submitted_at < ?
    ORDER BY submitted_at DESC, id DESC
  `)
  const selectReporterCountsInRange = db.prepare(`
    SELECT
      nickname,
      COUNT(*) AS reportCount
    FROM score_submissions
    WHERE submitted_at >= ? AND submitted_at < ?
    GROUP BY nickname
    ORDER BY reportCount DESC, nickname ASC
  `)

  const normalizeSubmission = (entry) => ({
    ...entry,
    becameBest: entry.becameBest === 1,
  })

  return {
    migration,

    submitScore(
      playerId,
      name,
      score,
      characterId = DEFAULT_CHARACTER_ID,
      submittedAt = Date.now(),
    ) {
      const normalizedCharacterId = normalizeCharacterId(characterId)
      db.exec('BEGIN IMMEDIATE')
      try {
        const current = findBest.get(playerId)
        const becameBest = !current || score > current.score
        const result = insertSubmission.run(
          playerId,
          name,
          score,
          normalizedCharacterId,
          becameBest ? 1 : 0,
          submittedAt,
        )
        incrementReporter.run(name)
        incrementTotal.run()
        upsertLeaderboard.run(
          playerId,
          name,
          score,
          normalizedCharacterId,
          submittedAt,
        )
        db.exec('COMMIT')
        return {
          submissionId: Number(result.lastInsertRowid),
          becameBest,
        }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },

    getLeaderboard() {
      return rankLeaderboardEntries(selectLeaderboard.all())
    },

    getStats() {
      return {
        scoreReportCount: selectTotal.get()?.value ?? 0,
        submissionCount: selectSubmissionCount.get().count,
        reporters: selectReporters.all(),
      }
    },

    getRecentSubmissions(limit = 20) {
      const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)))
      return db.prepare(`
        SELECT
          id,
          player_id AS playerId,
          nickname,
          submitted_score AS score,
          character_id AS characterId,
          became_best AS becameBest,
          submitted_at AS submittedAt
        FROM score_submissions
        ORDER BY submitted_at DESC, id DESC
        LIMIT ?
      `).all(safeLimit).map(normalizeSubmission)
    },

    getSubmissionsInRange(startTime, endTime) {
      return selectSubmissionsInRange
        .all(startTime, endTime)
        .map(normalizeSubmission)
    },

    getReporterCountsInRange(startTime, endTime) {
      return selectReporterCountsInRange.all(startTime, endTime)
    },

    close() {
      db.close()
    },
  }
}
