import { Readable } from 'node:stream'
import { beforeEach, afterEach, it, expect } from 'vitest'
import { createAuthStore } from './auth-store.mjs'
import { createAuthHandler, sessionToken, AUTH_BODY_LIMIT } from './auth.mjs'
import { ACCOUNT_HINT } from '../src/features/auth/validation.mjs'
let store, handler
beforeEach(() => {
  store = createAuthStore(':memory:')
  handler = createAuthHandler(store, { secure: true })
})
afterEach(() => store.close())
async function request(path, { method = 'POST', body = '{}', headers = {}, socket } = {}) {
  const req = Readable.from([Buffer.from(body)])
  req.method = method
  req.headers = { 'content-type': 'application/json', 'x-echo-request': '1', ...headers }
  req.socket = { remoteAddress: '127.0.0.1', ...socket }
  const result = { status: 0, headers: {}, data: null }
  const res = {
    headersSent: false,
    setHeader(key, value) {
      result.headers[key] = value
    },
    writeHead(status, headers) {
      result.status = status
      Object.assign(result.headers, headers)
      this.headersSent = true
    },
    end(body) {
      result.data = JSON.parse(body)
    },
  }
  await handler.handle(req, res, new URL(path, 'http://127.0.0.1'))
  return result
}
const enter = (path, account, progress = {}, headers) =>
  request(path, { body: JSON.stringify({ account, progress }), ...(headers && { headers }) })
it('sets bounded HttpOnly secure cookies and never returns hashes or session tokens in JSON', async () => {
  const result = await enter('/api/auth/register', 'cookie_player', {
    'farm-career-v1': '{"runs":1}',
  })
  expect(result.status).toBe(200)
  expect(result.headers['Set-Cookie']).toMatch(
    /HttpOnly; SameSite=Lax; Path=\/; Max-Age=604800; Secure/,
  )
  expect(Object.keys(result.data)).toEqual(['user'])
  expect(Object.keys(result.data.user).sort()).toEqual(['id', 'username'])
  expect(result.headers['Cache-Control']).toBe('no-store')
})
it.each([
  { 'x-echo-request': '0' },
  { 'content-type': 'text/plain' },
  { 'sec-fetch-site': 'cross-site' },
])('rejects cross-site and simple writes %j', async (headers) => {
  expect((await enter('/api/auth/register', 'csrf_player', {}, headers)).status).toBe(403)
})
it('rejects malformed and oversized inputs and rejects duplicate cookies', async () => {
  expect((await request('/api/auth/login', { body: '{' })).status).toBe(400)
  expect((await enter('/api/auth/register', 'ab')).status).toBe(400)
  expect((await request('/api/auth/login', { body: 'x'.repeat(AUTH_BODY_LIMIT + 1) })).status).toBe(
    413,
  )
  expect(sessionToken({ headers: { cookie: 'echo_session=one; echo_session=two' } })).toBeNull()
})
it.each(['ab', 'bad name', '用户名', 'x'.repeat(33)])(
  'rejects the malformed nickname %j with the hint on both routes',
  async (account) => {
    for (const path of ['/api/auth/register', '/api/auth/login']) {
      const result = await enter(path, account)
      expect(result.status).toBe(400)
      expect(result.data.error).toContain(ACCOUNT_HINT)
    }
  },
)
it('claims the nickname on both routes and keeps the save of the first visit', async () => {
  const created = await enter('/api/auth/register', 'nick_player', {
    'farm-career-v1': '{"runs":2}',
  })
  expect(created.status).toBe(200)
  expect(created.data.user.username).toBe('nick_player')
  // Login means the same thing now: it returns the existing band instead of
  // overwriting it with the progress this device brought along.
  const again = await enter('/api/auth/login', 'NICK_PLAYER', {
    'farm-career-v1': '{"runs":99}',
  })
  expect(again.status).toBe(200)
  expect(again.data.user).toEqual(created.data.user)
  expect(store.progress(created.data.user.id)).toEqual({
    data: { 'farm-career-v1': '{"runs":2}' },
    revision: 1,
  })
})
it('ignores a password field left over from older clients', async () => {
  const result = await request('/api/auth/register', {
    body: JSON.stringify({ account: 'legacy_client', password: 'Aa1!<> &+/%', progress: {} }),
  })
  expect(result.status).toBe(200)
  expect(result.data.user.username).toBe('legacy_client')
})
it('checks the write origin: same origin and headerless clients pass, foreign origins do not', async () => {
  const host = 'game.example:3001'
  const register = (account, headers) =>
    request('/api/auth/register', {
      body: JSON.stringify({ account, progress: {} }),
      headers,
    })
  expect((await register('origin_player', { host, origin: `http://${host}` })).status).toBe(200)
  // SameSite=Lax alone would allow this sibling page to write on the user's behalf.
  expect((await register('origin_player', { host, origin: 'http://evil.example' })).status).toBe(
    403,
  )
  expect(
    (await register('origin_player', { host, referer: 'http://evil.example/farm' })).status,
  ).toBe(403)
  expect((await register('other_origin_player', { host })).status).toBe(200)
})
it('adds Secure from the actual request protocol, not a plain-HTTP default', async () => {
  handler = createAuthHandler(store)
  const register = (account, options) =>
    request('/api/auth/register', {
      body: JSON.stringify({ account, progress: {} }),
      ...options,
    })
  const plain = await register('plain_player', { headers: { host: 'game.example:3001' } })
  expect(plain.status).toBe(200)
  expect(plain.headers['Set-Cookie']).not.toContain('Secure')
  const proxied = await register('proxied_player', {
    headers: { host: 'game.example', 'x-forwarded-proto': 'https, http' },
  })
  expect(proxied.headers['Set-Cookie']).toContain('Secure')
  const encrypted = await register('tls_player', { socket: { encrypted: true } })
  expect(encrypted.headers['Set-Cookie']).toContain('Secure')
})
it('blocks old account logout after the browser switched accounts', async () => {
  const old = await store.enter('old_account')
  const next = await store.enter('new_account')
  const result = await request('/api/auth/logout', {
    headers: { cookie: `echo_session=${next.token}`, 'x-echo-user': old.user.id },
  })
  expect(result.status).toBe(401)
  expect(result.headers['Set-Cookie']).toBeUndefined()
  expect(store.user(next.token)).toEqual(next.user)
})
it('limits entering attempts persistently without trusting forwarded IPs', async () => {
  for (let index = 0; index < 60; index++)
    expect(
      (await request('/api/auth/register', { headers: { 'x-forwarded-for': String(index) } }))
        .status,
    ).toBe(400)
  const limited = await request('/api/auth/register', { headers: { 'x-forwarded-for': 'new-ip' } })
  expect(limited.status).toBe(429)
  expect(limited.headers['Retry-After']).toBe('900')
})
it('keeps a separate login quota so exhausted registrations cannot lock out a shared IP', async () => {
  for (let index = 0; index < 60; index++)
    await request('/api/auth/register', { body: JSON.stringify({ account: 'x' }) })
  expect((await request('/api/auth/register', { body: '{}' })).status).toBe(429)
  // Any nickname can enter, so this is a successful claim rather than a 401.
  const login = await enter('/api/auth/login', 'shared_ip_player', {
    'farm-career-v1': '{"runs":5}',
  })
  expect(login.status).toBe(200)
  expect(login.data.user.username).toBe('shared_ip_player')
  expect(store.progress(login.data.user.id).data).toEqual({ 'farm-career-v1': '{"runs":5}' })
})
