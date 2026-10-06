import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { createAuthStore } from './auth-store.mjs'
import { createAuthHandler } from './auth.mjs'
import { handleProgressRequest } from './progress.mjs'
import { PROGRESS_LIMIT } from '../src/features/auth/progress.mjs'

let store, registered, auth
const data = {
  'farm-character-profile-v1': JSON.stringify({ coins: 1200, growth: { levels: { regen: 2 } } }),
  'farm-career-v1': '{"runs":2}',
  'farm-best-v9-boss-interval:2026-10-06': '12345',
}
beforeEach(async () => {
  store = createAuthStore(':memory:')
  registered = await store.register('guest_band', 'Aa1!test', data)
  auth = createAuthHandler(store)
})
afterEach(() => store.close())
async function request(method, body, headers = {}, authenticate) {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))],
  )
  req.method = method
  req.headers = {
    cookie: `echo_session=${registered.token}`,
    'x-echo-user': registered.user.id,
    'x-echo-request': '1',
    'content-type': 'application/json',
    ...headers,
  }
  const result = { status: 0, body: null, headers: null }
  const res = {
    headersSent: false,
    writeHead(status, headers) {
      this.headersSent = true
      result.status = status
      result.headers = headers
    },
    end(body) {
      result.body = JSON.parse(body)
    },
  }
  await handleProgressRequest(req, res, store, authenticate ?? (() => auth.authenticate(req)))
  return result
}
it('saves guest progress during registration and restores it using the authenticated account only', async () => {
  const saved = await request('GET')
  expect(saved.body).toEqual({ data, revision: 1 })
  expect(saved.headers['Cache-Control']).toBe('no-store')
  expect((await request('GET', undefined, { cookie: '' })).status).toBe(401)
  expect((await request('GET', undefined, { 'x-echo-user': 'different_account' })).status).toBe(401)
  const another = await store.register('another_band', 'Aa1!test')
  expect(store.progress(another.user.id).data).toEqual({})
  const next = { ...data, 'farm-career-v1': '{"runs":3}' }
  expect(
    (await request('POST', { data: next, revision: 1, accountId: another.user.id })).body,
  ).toEqual({ data: next, revision: 2 })
  expect(store.progress(another.user.id).data).toEqual({})
})
it('rejects stale overwrites and makes an identical retry idempotent', async () => {
  const next = { ...data, 'farm-career-v1': '{"runs":3}' }
  expect((await request('POST', { data: next, revision: 1 })).status).toBe(200)
  expect((await request('POST', { data: next, revision: 1 })).body.revision).toBe(2)
  expect((await request('POST', { data, revision: 1 })).status).toBe(409)
  expect((await request('GET')).body).toEqual({ data: next, revision: 2 })
})
it('rejects revoked sessions, including revocation while the body was uploading', async () => {
  let calls = 0
  expect(
    (
      await request('POST', { data, revision: 1 }, {}, () =>
        ++calls === 1 ? registered.user : null,
      )
    ).status,
  ).toBe(401)
  const next = await store.login('guest_band', 'Aa1!test')
  expect((await request('POST', { data, revision: 1 })).status).toBe(401)
  expect(store.user(next.token)).toEqual(registered.user)
  expect(store.progress(registered.user.id)).toEqual({ data, revision: 1 })
})
it('rejects cross-site requests, unapproved save keys and oversized payloads without changing the save', async () => {
  expect((await request('POST', { data, revision: 1 }, { 'x-echo-request': '' })).status).toBe(403)
  expect(
    (await request('POST', { data, revision: 1 }, { 'sec-fetch-site': 'cross-site' })).status,
  ).toBe(403)
  for (const invalid of [
    null,
    [],
    { password: 'secret' },
    { 'farm-career-v1': 2 },
    { 'farm-career-v1': 'x'.repeat(65537) },
  ])
    expect((await request('POST', { data: invalid, revision: 1 })).status).toBe(400)
  expect((await request('POST', '{')).status).toBe(400)
  expect((await request('POST', 'x'.repeat(PROGRESS_LIMIT + 1025))).status).toBe(413)
  expect(store.progress(registered.user.id)).toEqual({ data, revision: 1 })
})
it('keeps account progress across database reopen and leaves invalid registration atomic', async () => {
  const root = mkdtempSync(join(tmpdir(), 'echo-progress-'))
  let persistent = createAuthStore(join(root, 'game.db'))
  try {
    const account = await persistent.register('persistent_band', 'Aa1!test', data)
    persistent.close()
    persistent = createAuthStore(join(root, 'game.db'))
    expect(persistent.progress(account.user.id)).toEqual({ data, revision: 1 })
    await expect(
      persistent.register('invalid_band', 'Aa1!test', { password: 'no' }),
    ).rejects.toMatchObject({ status: 400 })
    expect((await persistent.register('invalid_band', 'Aa1!test', data)).user.username).toBe(
      'invalid_band',
    )
  } finally {
    persistent.close()
    rmSync(root, { recursive: true, force: true })
  }
})
