import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFarmStore } from '../server/farm-store.mjs'
import { farmKey } from '../server/farm.mjs'
import { validDay } from '../src/features/farm/calendar.mjs'

const args = process.argv.slice(2)
const startsOnly = args[0] === '--starts'
if (args.length > 1) throw new Error('用法：npm run db:inspect -- [YYYY-MM-DD|--starts]')
const day = startsOnly ? undefined : args[0]
if (day && !validDay(day)) throw new Error('日期无效，请使用 YYYY-MM-DD。')
const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDirectory = process.env.DATA_DIR || join(projectDirectory, 'server', 'data')
const store = createFarmStore(join(dataDirectory, 'game.db'))
try {
  console.log(`累计开局次数：${store.countStarts()}`)
  if (!startsOnly) {
    const board = store.boardAcrossDays('farm')
    console.log(`怪潮乐队历险记 · 历史总榜（${board.total} 位玩家）`)
    console.table(board.data.slice(0, 20))
    if (day) {
      const daily = store.board(farmKey(day), 'farm')
      console.log(`${day} 最佳成绩（${daily.total} 位玩家）`)
      console.table(daily.data.slice(0, 20))
    }
  }
} finally {
  store.close()
}
