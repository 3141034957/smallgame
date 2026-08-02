import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLeaderboardStore } from '../server/database.mjs'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDirectory = join(projectDirectory, 'server', 'data')
const store = createLeaderboardStore({
  databasePath: join(dataDirectory, 'game.db'),
  leaderboardPath: join(dataDirectory, 'leaderboard.json'),
  statsPath: join(dataDirectory, 'stats.json'),
})

try {
  const stats = store.getStats()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const todaySubmissions = store.getSubmissionsInRange(
    todayStart.getTime(),
    tomorrowStart.getTime(),
  )
  const dateLabel = [
    todayStart.getFullYear(),
    String(todayStart.getMonth() + 1).padStart(2, '0'),
    String(todayStart.getDate()).padStart(2, '0'),
  ].join('-')
  console.log('数据库统计')
  console.table({
    历史上报总数: stats.scoreReportCount,
    数据库提交记录数: stats.submissionCount,
    上报玩家数: stats.reporters.length,
  })
  console.log('排行榜 TOP 20')
  console.table(store.getLeaderboard().slice(0, 20))
  console.log(`当天每个昵称的上报次数（${dateLabel}）`)
  console.table(
    store.getReporterCountsInRange(
      todayStart.getTime(),
      tomorrowStart.getTime(),
    ),
  )
  console.log(`当天全部分数上报，共 ${todaySubmissions.length} 条（按时间倒序）`)
  console.table(todaySubmissions)
} finally {
  store.close()
}
