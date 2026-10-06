import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFarmStore } from '../server/farm-store.mjs'
import { FARM_PREFIX, farmKey } from '../server/farm.mjs'
import { validDay } from '../src/features/farm/calendar.mjs'

const day = process.argv[2]
if (day && !validDay(day)) throw new Error('日期无效，请使用 YYYY-MM-DD。')
const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDirectory = process.env.DATA_DIR || join(projectDirectory, 'server', 'data')
const store = createFarmStore(join(dataDirectory, 'game.db'))
try {
  const board = store.boardAcrossDays(FARM_PREFIX, 'farm')
  console.log(`怪潮乐队历险记 · 历史总榜（${board.total} 位玩家）`)
  console.table(board.data.slice(0, 20))
  if (day) {
    const daily = store.board(farmKey(day), 'farm')
    console.log(`${day} 最佳成绩（${daily.total} 位玩家）`)
    console.table(daily.data.slice(0, 20))
  }
} finally {
  store.close()
}
