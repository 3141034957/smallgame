import { FARM_RULESET, FARM_SCORE_PREFIX } from '../src/features/farm/monsters.mjs'
import { FPS, replayFarm } from '../src/features/farm/rules.mjs'
import { normalizeCharacterId, normalizePlayerId } from './identity.mjs'
export const MAX_FARM_BODY_BYTES = 1024 * 1024
// Ten minutes of simulation: enough for any real run, and it keeps a forged
// body from blocking the event loop during replay verification.
export const MAX_FARM_FRAMES = 10 * 60 * FPS
export const FARM_PREFIX = FARM_SCORE_PREFIX
export const farmKey = (day) => `${FARM_PREFIX}${day}`
export function verifyFarm(input) {
  const playerId = normalizePlayerId(input?.playerId)
  const name =
    typeof input?.name === 'string'
      ? input.name
          .trim()
          .replace(/[\s\p{Cc}]+/gu, ' ')
          .slice(0, 12)
          .trim()
      : ''
  if (!playerId || !name) return null
  if (!Array.isArray(input.frames) || !input.frames.length || input.frames.length > MAX_FARM_FRAMES)
    return null
  const round = replayFarm(
    input.day,
    input.frames,
    input.choices,
    input.surges,
    input.permanent === undefined ? {} : input.permanent,
  )
  if (!round || !Number.isInteger(input.score) || input.score !== round.score || !round.score)
    return null
  const characterId = normalizeCharacterId(input.characterId)
  return {
    playerId,
    name,
    songId: farmKey(round.day),
    difficulty: 'farm',
    score: round.score,
    accuracy: Math.min(10000, round.bosses * 1000 + round.harvested),
    maxCombo: round.maxCombo,
    stars: round.stars,
    seconds: Math.round(round.seconds),
    characterId,
  }
}
export async function handleFarmRequest(req, res, url, store) {
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/farm/leaderboard') {
      send(
        200,
        store.boardAcrossDays(
          FARM_PREFIX,
          'farm',
          normalizePlayerId(url.searchParams.get('playerId')),
        ),
      )
    } else if (req.method === 'POST' && url.pathname === '/api/farm/score') {
      let bytes = 0
      const chunks = []
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > MAX_FARM_BODY_BYTES) {
          send(413, { error: '本局记录过大，无法上传，成绩仍保留在本机。' })
          req.destroy()
          return
        }
        chunks.push(chunk)
      }
      let input
      try {
        input = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        send(400, { error: '战斗记录格式错误。' })
        return
      }
      if (input?.ruleset !== FARM_RULESET) {
        send(409, { error: '怪潮规则已更新，请刷新页面后重新挑战；本机存档仍然保留。' })
        return
      }
      const record = verifyFarm(input)
      if (!record) {
        send(400, { error: '成绩未通过校验，完成一局生存挑战后再上榜吧。' })
        return
      }
      store.submit(record)
      send(200, {
        ...store.boardAcrossDays(FARM_PREFIX, 'farm', record.playerId),
        acceptedScore: record.score,
      })
    } else send(404, { error: '无限榜接口不存在。' })
  } catch (error) {
    console.error('Farm leaderboard:', error)
    if (!res.headersSent) send(500, { error: '无限榜暂时忙碌，稍后再试。' })
  }
}
