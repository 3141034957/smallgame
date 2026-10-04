import { replayRound, validDay } from '../src/features/bounce/rules.mjs'
import { replayTour } from '../src/features/bounce/tour.mjs'
import { normalizePlayerId } from './leaderboard.mjs'

export const bounceKey = (day, mode = 'classic') => mode === 'tour' ? `bounce:v2:tour:${day}` : `bounce:v1:${day}`
export function verifyBounce(input) {
  const playerId = normalizePlayerId(input?.playerId)
  const name = typeof input?.name === 'string' ? input.name.trim().replace(/[\s\p{Cc}]+/gu, ' ').slice(0, 12).trim() : ''
  if (!playerId || !name || !validDay(input?.day)) return null
  const mode = input.mode ?? 'classic'
  if (!['classic', 'tour'].includes(mode)) return null
  const round = mode === 'tour' ? replayTour(input.day, input.shots) : replayRound(input.day, input.shots)
  if (!round || !Number.isInteger(input.score) || round.score !== input.score || !round.score) return null
  return { playerId, name, songId: bounceKey(round.day, mode), difficulty: 'bounce', score: round.score, accuracy: Math.round(round.hits / 63 * 10000), maxCombo: round.maxCombo, stars: round.stars }
}
export async function handleBounceRequest(req, res, url, store) {
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
  try {
    if (req.method === 'GET' && url.pathname === '/api/bounce/leaderboard') {
      const day = url.searchParams.get('day')
      const mode = url.searchParams.get('mode') ?? 'classic'
      if (!validDay(day) || !['classic', 'tour'].includes(mode)) { send(400, { error: '这一天的弹弹花园不存在。' }); return }
      send(200, store.board(bounceKey(day, mode), 'bounce', normalizePlayerId(url.searchParams.get('playerId'))))
    } else if (req.method === 'POST' && url.pathname === '/api/bounce/score') {
      let bytes = 0
      const chunks = []
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 2048) { send(413, { error: '弹射记录太长啦，请再玩一局。' }); return }
        chunks.push(chunk)
      }
      let input
      try { input = JSON.parse(Buffer.concat(chunks).toString()) } catch { send(400, { error: '弹射记录格式错误。' }); return }
      const record = verifyBounce(input)
      if (!record) { send(400, { error: '成绩未通过校验，完成三次弹射后再上榜吧。' }); return }
      send(200, { ...store.submit(record), acceptedScore: record.score })
    } else send(404, { error: '弹弹榜接口不存在。' })
  } catch (error) {
    console.error('Bounce leaderboard error:', error)
    if (!res.headersSent) send(500, { error: '弹弹榜暂时忙碌，成绩还在，请稍后重试。' })
  }
}
