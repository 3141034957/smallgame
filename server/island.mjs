import { ISLANDS, validDay, replayJourney, journeyStars } from '../src/features/island/rules.mjs'
import { normalizePlayerId } from './leaderboard.mjs'

const validIsland = (id) => ISLANDS.some((island) => island.id === id)
const boardKey = (id, day) => `island:${day}:${id}`
export function verifyJourney(input) {
  const playerId = normalizePlayerId(input?.playerId)
  const name =
    typeof input?.name === 'string'
      ? input.name
          .trim()
          .replace(/[\s\p{Cc}]+/gu, ' ')
          .slice(0, 12)
          .trim()
      : ''
  if (!playerId || !name || !validIsland(input.islandId) || !validDay(input.day)) return null
  const journey = replayJourney(input.islandId, input.day, input.actions)
  if (!journey || input.score !== journey.score || journey.score === 0) return null
  return {
    playerId,
    name,
    songId: boardKey(journey.islandId, journey.day),
    difficulty: 'explore',
    score: journey.score,
    accuracy: Math.round((journey.collected / 21) * 10000),
    maxCombo: journey.motifs,
    stars: journeyStars(journey),
  }
}

export async function handleIslandRequest(req, res, url, store) {
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/island/leaderboard') {
      const id = url.searchParams.get('island')
      const day = url.searchParams.get('day')
      if (!validIsland(id) || !validDay(day)) {
        send(400, { error: '这张航线不存在。' })
        return
      }
      send(
        200,
        store.board(
          boardKey(id, day),
          'explore',
          normalizePlayerId(url.searchParams.get('playerId')),
        ),
      )
    } else if (req.method === 'POST' && url.pathname === '/api/island/score') {
      let bytes = 0
      const chunks = []
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 16384) {
          send(413, { error: '旅途记录太长啦，请重新出发。' })
          return
        }
        chunks.push(chunk)
      }
      let input
      try {
        input = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        send(400, { error: '旅途记录格式错误。' })
        return
      }
      const record = verifyJourney(input)
      if (!record) {
        send(400, { error: '旅途记录未通过校验，请完成探险后再上榜。' })
        return
      }
      send(200, store.submit(record))
    } else send(404, { error: '航线接口不存在。' })
  } catch (error) {
    console.error('Island leaderboard error:', error)
    if (!res.headersSent) send(500, { error: '航线榜暂时忙碌，请稍后重试。' })
  }
}
