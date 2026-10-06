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

function getDateStart(dateArgument) {
  if (!dateArgument) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateArgument)
  if (!match) {
    throw new Error(`日期格式错误：${dateArgument}。请使用 YYYY-MM-DD，例如 2026-08-02。`)
  }

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`日期不存在：${dateArgument}`)
  }
  return date
}

try {
  const stats = store.getStats()
  const dateStart = getDateStart(process.argv[2])
  const nextDateStart = new Date(dateStart)
  nextDateStart.setDate(nextDateStart.getDate() + 1)
  const submissions = store.getSubmissionsInRange(dateStart.getTime(), nextDateStart.getTime())
  const dateLabel = [
    dateStart.getFullYear(),
    String(dateStart.getMonth() + 1).padStart(2, '0'),
    String(dateStart.getDate()).padStart(2, '0'),
  ].join('-')
  console.log('数据库统计')
  console.table({
    历史上报总数: stats.scoreReportCount,
    数据库提交记录数: stats.submissionCount,
    上报玩家数: stats.reporters.length,
  })
  console.log('排行榜 TOP 20')
  console.table(store.getLeaderboard().slice(0, 20))
  console.log(`指定日期每个昵称的上报次数（${dateLabel}）`)
  console.table(store.getReporterCountsInRange(dateStart.getTime(), nextDateStart.getTime()))
  console.log(`指定日期全部分数上报，共 ${submissions.length} 条（按时间倒序）`)
  console.table(submissions)
} finally {
  store.close()
}
