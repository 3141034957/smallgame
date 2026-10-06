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
async function request(path, { method = 'POST', body = '{}', headers = {} } = {}) {
  const req = Readable.from([Buffer.from(body)])
  req.method = method
  req.headers = { 'content-type': 'application/json', 'x-echo-request': '1', ...headers }
  req.socket = { remoteAddress: '127.0.0.1' }
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
  for (let index = 0; index < 30; index++)
    expect(
      (await request('/api/auth/register', { headers: { 'x-forwarded-for': String(index) } }))
        .status,
    ).toBe(400)
  const limited = await request('/api/auth/register', { headers: { 'x-forwarded-for': 'new-ip' } })
  expect(limited.status).toBe(429)
  expect(limited.headers['Retry-After']).toBe('900')
})
