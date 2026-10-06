import { Readable } from 'node:stream'
import { beforeEach, afterEach, it, expect } from 'vitest'
import { createAuthStore } from './auth-store.mjs'
import { createAuthHandler, sessionToken, AUTH_BODY_LIMIT } from './auth.mjs'
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
it('sets bounded HttpOnly secure cookies and never returns hashes or session tokens in JSON', async () => {
  const result = await request('/api/auth/register', {
    body: JSON.stringify({ account: 'cookie_player', password: 'Aa1!<> &+/%' }),
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
  expect((await request('/api/auth/register', { headers })).status).toBe(403)
})
it('rejects malformed and oversized inputs before hashing, and rejects duplicate cookies', async () => {
  expect((await request('/api/auth/login', { body: '{' })).status).toBe(400)
  expect(
    (
      await request('/api/auth/register', {
        body: JSON.stringify({ account: 'user', password: 'Ab1!' }),
      })
    ).status,
  ).toBe(400)
  expect((await request('/api/auth/login', { body: 'x'.repeat(AUTH_BODY_LIMIT + 1) })).status).toBe(
    413,
  )
  expect(sessionToken({ headers: { cookie: 'echo_session=one; echo_session=two' } })).toBeNull()
})
it('checks the write origin: same origin and headerless clients pass, foreign origins do not', async () => {
  const host = 'game.example:3001'
  const register = (account, headers) =>
    request('/api/auth/register', {
      body: JSON.stringify({ account, password: 'Aa1!<> &+/%' }),
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
      body: JSON.stringify({ account, password: 'Aa1!<> &+/%' }),
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
  const old = await store.register('old_account', 'Aa1!<> &+/%')
  const next = await store.register('new_account', 'Aa1!<> &+/%')
  const result = await request('/api/auth/logout', {
    headers: { cookie: `echo_session=${next.token}`, 'x-echo-user': old.user.id },
  })
  expect(result.status).toBe(401)
  expect(result.headers['Set-Cookie']).toBeUndefined()
  expect(store.user(next.token)).toEqual(next.user)
})
it('limits registration attempts persistently without trusting forwarded IPs', async () => {
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
  const login = await request('/api/auth/login', {
    body: JSON.stringify({ account: 'shared_ip_player', password: 'Aa1!<> &+/%' }),
  })
  expect(login.status).toBe(401)
})
