import { replayFarm, validDay } from '../src/features/farm/rules.mjs'
import { normalizePlayerId } from './leaderboard.mjs'
export const MAX_FARM_BODY_BYTES = 1024 * 1024
export const farmKey = (day) => `farm:v4:endless:${day}`
export function verifyFarm(input) {
  const playerId = normalizePlayerId(input?.playerId)
  const name = typeof input?.name === 'string' ? input.name.trim().replace(/[\s\p{Cc}]+/gu, ' ').slice(0, 12).trim() : ''
  if (!playerId || !name) return null
  const round = replayFarm(input.day, input.frames, input.choices, input.surges)
  if (!round || !Number.isInteger(input.score) || input.score !== round.score || !round.score) return null
  return { playerId, name, songId: farmKey(round.day), difficulty: 'farm', score: round.score, accuracy: Math.min(10000, round.bosses * 1000 + round.harvested), maxCombo: round.maxCombo, stars: round.stars }
}
export async function handleFarmRequest(req, res, url, store) {
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
  try {
    if (req.method === 'GET' && url.pathname === '/api/farm/leaderboard') {
      const day = url.searchParams.get('day')
      if (!validDay(day)) { send(400, { error: '请选择有效日期。' }); return }
      send(200, store.board(farmKey(day), 'farm', normalizePlayerId(url.searchParams.get('playerId'))))
    } else if (req.method === 'POST' && url.pathname === '/api/farm/score') {
      let bytes = 0; const chunks = []
      for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_FARM_BODY_BYTES) { send(413, { error: '本局记录过大，无法上传，成绩仍保留在本机。' }); return }; chunks.push(chunk) }
      let input
      try { input = JSON.parse(Buffer.concat(chunks).toString()) } catch { send(400, { error: '战斗记录格式错误。' }); return }
      const record = verifyFarm(input)
      if (!record) { send(400, { error: '成绩未通过校验，完成一局生存挑战后再上榜吧。' }); return }
      send(200, { ...store.submit(record), acceptedScore: record.score })
    } else send(404, { error: '无限榜接口不存在。' })
  } catch (error) { console.error('Farm leaderboard:', error); if (!res.headersSent) send(500, { error: '无限榜暂时忙碌，稍后再试。' }) }
}
