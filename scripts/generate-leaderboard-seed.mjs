import { readFile } from 'node:fs/promises'
import { MAX_SCORE, normalizeScoreInput } from '../worker/leaderboard.js'

const leaderboardPath = new URL('../server/data/leaderboard.json', import.meta.url)
const statsPath = new URL('../server/data/stats.json', import.meta.url)

const leaderboardSource = JSON.parse(await readFile(leaderboardPath, 'utf8'))
const statsSource = JSON.parse(await readFile(statsPath, 'utf8'))

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const bestByName = new Map()

for (const entry of leaderboardSource) {
  const normalized = normalizeScoreInput(entry)
  if (!normalized || normalized.score > MAX_SCORE) continue
  const current = bestByName.get(normalized.name)
  if (!current || normalized.score > current.score) {
    bestByName.set(normalized.name, {
      ...normalized,
      updatedAt: Number.isFinite(entry.time) ? Math.floor(entry.time) : 0,
    })
  }
}

const reportersByName = new Map()
for (const reporter of Array.isArray(statsSource.reporters) ? statsSource.reporters : []) {
  const nickname = typeof reporter?.nickname === 'string'
    ? reporter.nickname.trim().replace(/\s+/g, ' ').slice(0, 12)
    : ''
  if (!nickname || !Number.isSafeInteger(reporter.reportCount) || reporter.reportCount < 0) {
    continue
  }
  reportersByName.set(
    nickname,
    (reportersByName.get(nickname) ?? 0) + reporter.reportCount,
  )
}

const leaderboardValues = [...bestByName.values()]
  .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  .map((entry) => `  (${quote(entry.name)}, ${entry.score}, ${entry.updatedAt})`)
  .join(',\n')
const reporterValues = [...reportersByName]
  .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
  .map(([nickname, reportCount]) => `  (${quote(nickname)}, ${reportCount})`)
  .join(',\n')
const scoreReportCount = Number.isSafeInteger(statsSource.scoreReportCount) &&
  statsSource.scoreReportCount >= 0
  ? statsSource.scoreReportCount
  : 0

const statements = [
  `INSERT INTO leaderboard (name, score, updated_at) VALUES\n${leaderboardValues}\nON CONFLICT(name) DO UPDATE SET\n  score = excluded.score,\n  updated_at = excluded.updated_at;`,
  `INSERT INTO score_reporters (nickname, report_count) VALUES\n${reporterValues}\nON CONFLICT(nickname) DO UPDATE SET\n  report_count = excluded.report_count;`,
  `INSERT INTO app_stats (key, value)\nVALUES ('score_report_count', ${scoreReportCount})\nON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
  'PRAGMA optimize;',
]

process.stdout.write(`${statements.join('\n--> statement-breakpoint\n')}\n`)
