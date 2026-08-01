import {
  MAX_SCORE,
  normalizeScoreInput,
  rankLeaderboardEntries,
} from './leaderboard.js'

const MAX_REQUEST_BODY_BYTES = 16 * 1024

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

async function submitScore(request, db) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    return json({ error: 'request body too large' }, 413)
  }

  let body
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BODY_BYTES) {
      return json({ error: 'request body too large' }, 413)
    }
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid JSON' }, 400)
  }

  const input = normalizeScoreInput(body)
  if (!input) {
    return json({
      error: 'name is required and score must be a non-negative number',
    }, 400)
  }
  if (input.score > MAX_SCORE) return json({ success: true, ignored: true })

  const now = Date.now()
  await db.batch([
    db.prepare(`
      INSERT INTO app_stats (key, value)
      VALUES ('score_report_count', 1)
      ON CONFLICT(key) DO UPDATE SET value = value + 1
    `),
    db.prepare(`
      INSERT INTO score_reporters (nickname, report_count)
      VALUES (?, 1)
      ON CONFLICT(nickname) DO UPDATE SET report_count = report_count + 1
    `).bind(input.name),
    db.prepare(`
      INSERT INTO leaderboard (name, score, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        score = excluded.score,
        updated_at = excluded.updated_at
      WHERE excluded.score > leaderboard.score
    `).bind(input.name, input.score, now),
  ])

  return json({ success: true })
}

async function getLeaderboard(db) {
  const { results = [] } = await db.prepare(`
    SELECT name, score, updated_at AS updatedAt
    FROM leaderboard
    ORDER BY score DESC, updated_at ASC, name ASC
    LIMIT 100
  `).all()

  return json({
    data: rankLeaderboardEntries(results),
  })
}

async function handleApi(request, env, url) {
  if (!env.DB) return json({ error: 'database unavailable' }, 503)

  if (request.method === 'POST' && url.pathname === '/api/score') {
    return submitScore(request, env.DB)
  }
  if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
    return getLeaderboard(env.DB)
  }
  return json({ error: 'not found' }, 404)
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url)
      } catch (error) {
        console.error('Leaderboard API failed', error)
        return json({ error: 'internal server error' }, 500)
      }
    }

    const response = await env.ASSETS.fetch(request)

    if (
      response.status !== 404 ||
      !['GET', 'HEAD'].includes(request.method) ||
      !request.headers.get('accept')?.includes('text/html')
    ) {
      return response
    }

    const indexUrl = new URL('/index.html', request.url)
    return env.ASSETS.fetch(new Request(indexUrl, request))
  },
}

export default worker
