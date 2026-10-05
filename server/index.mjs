import { createServer } from 'http'
import { readFileSync, statSync } from 'fs'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'zlib'
import { isIP } from 'net'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createLeaderboardStore } from './database.mjs'
import { createMelodyStore, handleMelodyRequest } from './melody.mjs'
import { handleIslandRequest } from './island.mjs'
import { handleWaveRequest } from './wave.mjs'
import { handleBounceRequest } from './bounce.mjs'
import { handleFarmRequest } from './farm.mjs'
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

// Mobile networks are slow: hashed build files never change, so they are sent
// once with a long cache, and every text response is compressed and remembered.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.ico', '.txt', '.xml'])
const MIN_COMPRESS_BYTES = 1024
const encodedCache = new Map()

function pickEncoding(header) {
  const accepted = String(header || '')
  if (accepted.includes('br')) return 'br'
  if (accepted.includes('gzip')) return 'gzip'
  return null
}

function encode(key, content, encoding) {
  const cached = encodedCache.get(key)
  if (cached) return cached
  const encoded = encoding === 'br'
    ? brotliCompressSync(content, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
    : gzipSync(content, { level: 6 })
  if (encodedCache.size > 64) encodedCache.clear()
  encodedCache.set(key, encoded)
  return encoded
}

function sendStatic(req, res, pathname) {
  const filePath = join(CLIENT_DIR, pathname === '/' ? 'index.html' : pathname)
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  const isIndex = filePath === join(CLIENT_DIR, 'index.html')
  let content
  let mtimeMs = 0
  try {
    const stat = statSync(filePath)
    mtimeMs = stat.mtimeMs
    content = readFileSync(filePath)
  } catch {
    // fallback to index.html for SPA routing
    try {
      const stat = statSync(join(CLIENT_DIR, 'index.html'))
      mtimeMs = stat.mtimeMs
      content = readFileSync(join(CLIENT_DIR, 'index.html'))
    } catch {
      res.writeHead(404)
      res.end('Not found')
      return
    }
  }
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    // Hashed assets are immutable; the html entry point must always revalidate.
    'Cache-Control': isIndex ? 'no-cache' : ext === '.html' ? 'no-cache' : `public, max-age=${filePath.includes('/assets/') ? 31536000 : 3600}${filePath.includes('/assets/') ? ', immutable' : ''}`,
  }
  const encoding = COMPRESSIBLE.has(ext) && content.length >= MIN_COMPRESS_BYTES ? pickEncoding(req.headers['accept-encoding']) : null
  const body = encoding ? encode(`${filePath}:${mtimeMs}:${encoding}`, content, encoding) : content
  if (encoding) {
    headers['Content-Encoding'] = encoding
    headers['Vary'] = 'Accept-Encoding'
  }
  headers['Content-Length'] = body.length
  res.writeHead(200, headers)
  res.end(req.method === 'HEAD' ? undefined : body)
}

function normalizeIp(value) {
  if (Array.isArray(value)) value = value[0]
  if (typeof value !== 'string') return null

  let candidate = value.split(',')[0].trim()
  if (candidate.startsWith('::ffff:')) candidate = candidate.slice(7)
  return isIP(candidate) ? candidate : null
}

function getClientIp(req) {
  return normalizeIp(req.headers['cf-connecting-ip']) ||
    normalizeIp(req.socket.remoteAddress)
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

        const playerId = requestBody.playerId === undefined
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
  sendStatic(req, res, pathname)
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
      melodyStore.close()
      process.exit(0)
    })
  })
}
