import { replayWave, validDay } from '../src/features/wave/rules.mjs'
import { normalizePlayerId } from './leaderboard.mjs'
export const waveKey = (day) => `wave:v1:${day}`
export function verifyWave(input) {
  const playerId = normalizePlayerId(input?.playerId)
  const name = typeof input?.name === 'string' ? input.name.trim().replace(/[\s\p{Cc}]+/gu, ' ').slice(0, 12).trim() : ''
  if (!playerId || !name) return null
  const round = replayWave(input.day, input.actions)
  if (!round || !Number.isInteger(input.score) || round.score !== input.score || !round.score) return null
  return { playerId, name, songId: waveKey(round.day), difficulty: 'wave', score: round.score, accuracy: Math.min(10000, round.clears), maxCombo: round.maxCombo, stars: round.stars }
}
export async function handleWaveRequest(req, res, url, store) {
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
  try {
    if (req.method === 'GET' && url.pathname === '/api/wave/leaderboard') {
      const day = url.searchParams.get('day')
      if (!validDay(day)) { send(400, { error: '请选择有效日期。' }); return }
      send(200, store.board(waveKey(day), 'wave', normalizePlayerId(url.searchParams.get('playerId'))))
    } else if (req.method === 'POST' && url.pathname === '/api/wave/score') {
      let bytes = 0; const chunks = []
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) { send(413, { error: '演奏记录过长。' }); return }; chunks.push(chunk) }
      let input
      try { input = JSON.parse(Buffer.concat(chunks).toString()) } catch { send(400, { error: '演奏记录格式错误。' }); return }
      const record = verifyWave(input)
      if (!record) { send(400, { error: '演奏未通过校验，请完成一局后重试。' }); return }
      send(200, { ...store.submit(record), acceptedScore: record.score })
    } else send(404, { error: '排行榜接口不存在。' })
  } catch (error) { console.error('Wave leaderboard:', error); if (!res.headersSent) send(500, { error: '排行榜暂时忙碌，稍后再试。' }) }
}
