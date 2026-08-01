import { createServer } from 'http'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createLeaderboardStore } from './database.mjs'
import {
  MAX_SCORE,
  normalizeCharacterId,
  normalizeScoreInput,
} from './leaderboard.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
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

  // ── POST /api/score — submit score ──
  if (method === 'POST' && pathname === '/api/score') {
    let body = ''
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
      body += chunk
    })
    req.on('end', () => {
      if (requestRejected) return
      try {
        const requestBody = JSON.parse(body)
        const input = normalizeScoreInput(requestBody)
        if (!input) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: 'name is required and score must be a non-negative number',
          }))
          return
        }

        if (input.score > MAX_SCORE) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, ignored: true }))
          return
        }

        leaderboardStore.submitScore(
          input.name,
          input.score,
          normalizeCharacterId(requestBody.characterId),
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
  let filePath = join(CLIENT_DIR, pathname === '/' ? 'index.html' : pathname)
  try {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const content = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  } catch {
    // fallback to index.html for SPA routing
    try {
      const content = readFileSync(join(CLIENT_DIR, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  }
})

server.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`)
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
      process.exit(0)
    })
  })
}
