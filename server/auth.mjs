import { AuthError, SESSION_TTL } from './auth-store.mjs'
export const SESSION_COOKIE = 'echo_session'
export const AUTH_BODY_LIMIT = 16 * 1024
export function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}
export function sessionToken(req) {
  const matches = (req.headers.cookie ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.startsWith(`${SESSION_COOKIE}=`))
  return matches.length === 1 ? matches[0].slice(SESSION_COOKIE.length + 1) : null
}
export function allowAccountWrite(req, res) {
  if (
    req.headers['x-echo-request'] !== '1' ||
    req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json' ||
    req.headers['sec-fetch-site'] === 'cross-site'
  ) {
    sendJson(res, 403, { error: '请从游戏页面操作账号。' })
    return false
  }
  return true
}
export function createAuthHandler(store, { secure = process.env.AUTH_COOKIE_SECURE === '1' } = {}) {
  const cookie = (token, maxAge) =>
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  const authenticate = (req) => {
    const user = store.user(sessionToken(req))
    const expected = req.headers['x-echo-user']
    return user && (!expected || expected === user.id) ? user : null
  }
  return {
    authenticate,
    async handle(req, res, url) {
      try {
        if (req.method === 'GET' && url.pathname === '/api/auth/session') {
          const user = authenticate(req)
          if (!user && sessionToken(req))
            sendJson(res, 401, { error: '登录已失效或在别处登录，请重新登录。' })
          else sendJson(res, 200, { user })
          return
        }
        if (
          req.method !== 'POST' ||
          !['/api/auth/register', '/api/auth/login', '/api/auth/logout'].includes(url.pathname)
        ) {
          sendJson(res, 404, { error: '账号接口不存在。' })
          return
        }
        if (!allowAccountWrite(req, res)) return
        if (url.pathname === '/api/auth/logout') {
          const current = store.user(sessionToken(req))
          if (current && req.headers['x-echo-user'] !== current.id) {
            sendJson(res, 401, { error: '当前账号已切换，请刷新页面。' })
            return
          }
          store.logout(sessionToken(req))
          res.setHeader('Set-Cookie', cookie('', 0))
          sendJson(res, 200, { user: null })
          return
        }
        // Use the socket address, never a forgeable forwarded IP.
        store.consumeAttempt(`ip:${req.socket.remoteAddress}`, 30)
        let bytes = 0
        const chunks = []
        for await (const chunk of req) {
          bytes += chunk.length
          if (bytes > AUTH_BODY_LIMIT) {
            sendJson(res, 413, { error: '账号请求过大。' })
            req.destroy()
            return
          }
          chunks.push(chunk)
        }
        let input
        try {
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          throw new AuthError(400, '账号请求格式错误。')
        }
        const result = url.pathname.endsWith('/register')
          ? await store.register(input?.account, input?.password)
          : await store.login(input?.account, input?.password)
        res.setHeader('Set-Cookie', cookie(result.token, SESSION_TTL / 1000))
        sendJson(res, 200, { user: result.user })
      } catch (error) {
        if (error instanceof AuthError) {
          if (error.status === 429) res.setHeader('Retry-After', '900')
          if (error.status === 503) res.setHeader('Retry-After', '1')
          sendJson(res, error.status, { error: error.message })
        } else {
          console.error('Account service failed:', error?.code ?? 'unknown')
          if (!res.headersSent) sendJson(res, 500, { error: '账号服务暂时不可用，请稍后重试。' })
        }
      }
    },
  }
}
