import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const DATA_FILE = join(DATA_DIR, 'leaderboard.json')
const STATS_FILE = join(DATA_DIR, 'stats.json')
const PORT = process.env.PORT || 3001
const MAX_SCORE = 500_000
const MAX_REQUEST_BODY_BYTES = 16 * 1024
const CLIENT_DIR = join(__dirname, '..', 'dist', 'client')

// Ensure data directory and file exist
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, '[]', 'utf-8')
if (!existsSync(STATS_FILE)) {
  writeFileSync(STATS_FILE, JSON.stringify({
    scoreReportCount: 0,
    reporters: [],
  }, null, 2), 'utf-8')
}

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

function readLeaderboard() {
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeLeaderboard(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function recordScoreReport(nickname) {
  let stats = {
    scoreReportCount: 0,
    reporters: [],
  }

  try {
    const stored = JSON.parse(readFileSync(STATS_FILE, 'utf-8'))
    const countsByNickname = new Map()
    if (Array.isArray(stored?.reporters)) {
      for (const reporter of stored.reporters) {
        if (
          typeof reporter?.nickname !== 'string' ||
          !Number.isSafeInteger(reporter.reportCount) ||
          reporter.reportCount < 0
        ) {
          continue
        }
        const storedNickname = reporter.nickname.trim().slice(0, 12)
        if (!storedNickname) continue
        countsByNickname.set(
          storedNickname,
          (countsByNickname.get(storedNickname) ?? 0) + reporter.reportCount,
        )
      }
    }
    stats.scoreReportCount =
      Number.isSafeInteger(stored?.scoreReportCount) && stored.scoreReportCount >= 0
        ? stored.scoreReportCount
        : 0
    stats.reporters = [...countsByNickname].map(([storedNickname, reportCount]) => ({
      nickname: storedNickname,
      reportCount,
    }))
  } catch {
    // Recover from a missing or malformed stats file by restarting the counter.
  }

  stats.scoreReportCount += 1
  const reporter = stats.reporters.find((entry) => entry.nickname === nickname)
  if (reporter) {
    reporter.reportCount += 1
  } else {
    stats.reporters.push({ nickname, reportCount: 1 })
  }
  stats.reporters.sort(
    (left, right) =>
      right.reportCount - left.reportCount ||
      left.nickname.localeCompare(right.nickname, 'zh-CN'),
  )
  try {
    writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to persist score report stats:', error)
  }
}

function deduplicateLeaderboard(records) {
  const bestByName = new Map()

  for (const entry of records) {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      !Number.isFinite(entry.score) ||
      entry.score > MAX_SCORE
    ) {
      continue
    }

    const name = entry.name.trim().slice(0, 12)
    const score = Math.max(0, Math.floor(entry.score))
    const current = bestByName.get(name)

    if (!current || score > current.score) {
      bestByName.set(name, {
        name,
        score,
        time: Number.isFinite(entry.time) ? entry.time : Date.now(),
      })
    }
  }

  return [...bestByName.values()]
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
        const { name, score } = JSON.parse(body)
        const normalizedName = typeof name === 'string'
          ? name.trim().slice(0, 12)
          : ''
        if (!normalizedName || !Number.isFinite(score) || score < 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            error: 'name is required and score must be a non-negative number',
          }))
          return
        }

        if (score > MAX_SCORE) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, ignored: true }))
          return
        }

        recordScoreReport(normalizedName)

        const records = deduplicateLeaderboard(readLeaderboard())
        const normalizedScore = Math.floor(score)
        const now = Date.now()
        const existing = records.find((entry) => entry.name === normalizedName)

        if (existing) {
          if (normalizedScore > existing.score) {
            existing.score = normalizedScore
            existing.time = now
          }
        } else {
          records.push({ name: normalizedName, score: normalizedScore, time: now })
        }

        writeLeaderboard(records)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid JSON' }))
      }
    })
    return
  }

  // ── GET /api/leaderboard — get top 100 ──
  if (method === 'GET' && pathname === '/api/leaderboard') {
    const records = deduplicateLeaderboard(readLeaderboard())
    // sort by score desc, keep only top 100 with rank
    const top100 = records
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map((entry, i) => ({
        rank: i + 1,
        name: entry.name,
        score: entry.score,
      }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: top100 }))
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
  console.log(`📁 Data stored at ${DATA_FILE}`)
})
