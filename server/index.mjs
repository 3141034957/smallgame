import { createServer } from 'http'
import { isIP } from 'net'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createLeaderboardStore } from './database.mjs'
import { createMelodyStore, handleMelodyRequest } from './melody.mjs'
import { handleIslandRequest } from './island.mjs'
import { handleWaveRequest } from './wave.mjs'
import { handleBounceRequest } from './bounce.mjs'
import { handleFarmRequest } from './farm.mjs'
import { createStaticHandler } from './static.mjs'
import {
  createLegacyPlayerId,
  MAX_SCORE,
  normalizeCharacterId,
  normalizePlayerId,
  normalizeScoreInput,
} from './leaderboard.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')
const DATABASE_FILE = join(DATA_DIR, 'game.db')
const LEGACY_LEADERBOARD_FILE = join(DATA_DIR, 'leaderboard.json')
const LEGACY_STATS_FILE = join(DATA_DIR, 'stats.json')
const PORT = process.env.PORT || 3001
const MAX_REQUEST_BODY_BYTES = 16 * 1024
const CLIENT_DIR = join(__dirname, '..', 'dist', 'client')

const leaderboardStore = createLeaderboardStore({
  databasePath: DATABASE_FILE,
  leaderboardPath: LEGACY_LEADERBOARD_FILE,
  statsPath: LEGACY_STATS_FILE,
})
const melodyStore = createMelodyStore(DATABASE_FILE)

const sendStatic = createStaticHandler(CLIENT_DIR)

function normalizeIp(value) {
  if (Array.isArray(value)) value = value[0]
  if (typeof value !== 'string') return null

  let candidate = value.split(',')[0].trim()
  if (candidate.startsWith('::ffff:')) candidate = candidate.slice(7)
  return isIP(candidate) ? candidate : null
}

function getClientIp(req) {
  return normalizeIp(req.headers['cf-connecting-ip']) || normalizeIp(req.socket.remoteAddress)
}

const server = createServer((req, res) => {
  let url
  try {
    // Routing does not depend on the untrusted Host header. Malformed request
    // targets are rejected locally instead of throwing out of the HTTP callback.
    url = new URL(req.url, 'http://localhost')
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: 'invalid request URL' }))
    return
  }
  const pathname = url.pathname
  const method = req.method

  // ── CORS headers ──
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (pathname.startsWith('/api/melody/')) {
    void handleMelodyRequest(req, res, url, melodyStore)
    return
  }
  if (pathname.startsWith('/api/island/')) {
    void handleIslandRequest(req, res, url, melodyStore)
    return
  }
  if (pathname.startsWith('/api/wave/')) {
    void handleWaveRequest(req, res, url, melodyStore)
    return
  }
  if (pathname.startsWith('/api/bounce/')) {
    void handleBounceRequest(req, res, url, melodyStore)
    return
  }
  if (pathname.startsWith('/api/farm/')) {
    void handleFarmRequest(req, res, url, melodyStore)
    return
  }

  // ── POST /api/score — submit score ──
  if (method === 'POST' && pathname === '/api/score') {
    const chunks = []
    let bodyBytes = 0
    let requestRejected = false
    req.on('data', (chunk) => {
      if (requestRejected) return
      bodyBytes += chunk.length
      if (bodyBytes > MAX_REQUEST_BODY_BYTES) {
        requestRejected = true
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'request body too large' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (requestRejected) return
      try {
        // A network chunk can end in the middle of a UTF-8 character. Decode
        // once after joining all bytes, rather than corrupting Chinese names.
        const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const input = normalizeScoreInput(requestBody)
        if (!input) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'name is required and score must be a non-negative number',
            }),
          )
          return
        }

        if (input.score > MAX_SCORE) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, ignored: true }))
          return
        }

        const playerId =
          requestBody.playerId === undefined
            ? createLegacyPlayerId(input.name)
            : normalizePlayerId(requestBody.playerId)
        if (!playerId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid playerId' }))
          return
        }

        leaderboardStore.submitScore(
          playerId,
          input.name,
          input.score,
          normalizeCharacterId(requestBody.characterId),
          Date.now(),
          getClientIp(req),
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          console.error('Failed to submit score:', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'internal server error' }))
          return
        }
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid JSON' }))
      }
    })
    return
  }

  // ── GET /api/leaderboard — get top 100 ──
  if (method === 'GET' && pathname === '/api/leaderboard') {
    try {
      const top100 = leaderboardStore.getLeaderboard()
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify({ data: top100 }))
    } catch (error) {
      console.error('Failed to load leaderboard:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'internal server error' }))
    }
    return
  }

  // ── Serve static files (production) ──
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: 'API not found' }))
    return
  }
  sendStatic(req, res, pathname)
})

server.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${server.address().port}`)
  console.log(`🗄️ Database stored at ${DATABASE_FILE}`)
  if (leaderboardStore.migration.imported) {
    console.log(
      `✅ Imported ${leaderboardStore.migration.leaderboardCount} leaderboard records from JSON`,
    )
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      leaderboardStore.close()
      melodyStore.close()
      process.exit(0)
    })
  })
}
