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
  console.log('数据库统计')
  console.table({
    历史上报总数: stats.scoreReportCount,
    数据库提交记录数: stats.submissionCount,
    上报玩家数: stats.reporters.length,
  })
  console.log('排行榜 TOP 20')
  console.table(store.getLeaderboard().slice(0, 20))
  console.log('最近 20 次分数提交')
  console.table(store.getRecentSubmissions(20))
} finally {
  store.close()
}
