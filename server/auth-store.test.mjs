import { beforeEach, afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthStore, SESSION_TTL, ATTEMPT_WINDOW } from './auth-store.mjs'
import { createFarmStore } from './farm-store.mjs'
import { normalizeAccount, validPassword } from '../src/features/auth/validation.mjs'
let store, directory, time
beforeEach(() => {
  time = 1000000
  directory = mkdtempSync(join(tmpdir(), 'echo-account-test-'))
  store = createAuthStore(join(directory, 'game.db'), { now: () => time })
})
afterEach(() => {
  store.close()
  rmSync(directory, { recursive: true, force: true })
})
const password = ' Aa1!"\'<> &+/%\\= ' // Deliberately preserve leading/trailing spaces and punctuation.

it('accepts mixed password characters without trimming or forcing all character classes', () => {
  expect(normalizeAccount(' My_Player ')).toBe('my_player')
  for (const invalid of [null, 'ab', 'bad-name', '用户名', 'x'.repeat(33)])
    expect(normalizeAccount(invalid)).toBeNull()
  for (const valid of [
    password,
    'abcdefgh',
    '12345678',
    '!!!!!!!!',
    'X'.repeat(128),
    '汉字也可以Aa1!',
  ])
    expect(validPassword(valid)).toBe(true)
  for (const invalid of [
    null,
    'short7!',
    ' '.repeat(8),
    'x'.repeat(129),
    'Abcd\u0000efg',
    '\ud800abcdefg',
  ])
    expect(validPassword(invalid)).toBe(false)
})
it('stores independently salted hashes and hashed sessions, never plaintext secrets', async () => {
  const a = await store.register('Player_1', password)
  const b = await store.register('Player_2', password)
  const db = new DatabaseSync(join(directory, 'game.db'))
  const rows = db.prepare('SELECT password_hash FROM accounts').all()
  expect(rows[0].password_hash).toMatch(/^scrypt\$32768\$8\$3\$/)
  expect(rows[0].password_hash).not.toBe(rows[1].password_hash)
  const serialized = JSON.stringify([
    ...rows,
    ...db.prepare('SELECT * FROM account_sessions').all(),
  ])
  expect(serialized).not.toContain(password)
  expect(serialized).not.toContain(a.token)
  expect(serialized).not.toContain(b.token)
  db.close()
  expect(store.user(a.token)).toEqual(a.user)
  expect(store.user(`${a.token}x`)).toBeNull()
})
it('replaces only the same account session and old logout cannot delete the new login', async () => {
  const first = await store.register('player', password)
  const other = await store.register('other', password)
  await expect(store.login('player', password.trim())).rejects.toMatchObject({ status: 401 })
  expect(store.user(first.token)).toEqual(first.user)
  const next = await store.login('PLAYER', password)
  expect(next.user).toEqual(first.user)
  expect(store.user(first.token)).toBeNull()
  store.logout(first.token)
  expect(store.user(next.token)).toEqual(next.user)
  expect(store.user(other.token)).toEqual(other.user)
  store.logout(next.token)
  expect(store.user(next.token)).toBeNull()
})
it('survives restarts, expires at seven days and leaves existing scores intact', async () => {
  const farm = createFarmStore(join(directory, 'game.db'))
  const result = await store.register('persist', password)
  store.close()
  store = createAuthStore(join(directory, 'game.db'), { now: () => time })
  expect(store.user(result.token)).toEqual(result.user)
  time += SESSION_TTL
  expect(store.user(result.token)).toBeNull()
  const renewed = await store.login('persist', password)
  expect(store.user(renewed.token)).toEqual(result.user)
  expect(farm.boardAcrossDays('farm:', 'farm').data).toEqual([])
  farm.close()
})
it('purges expired sessions on startup so the table cannot grow forever', async () => {
  const expired = await store.register('expired_player', password)
  time += SESSION_TTL
  const live = await store.register('live_player', password)
  expect(store.user(expired.token)).toBeNull()
  const count = () => {
    const db = new DatabaseSync(join(directory, 'game.db'))
    try {
      return db.prepare('SELECT COUNT(*) AS total FROM account_sessions').get().total
    } finally {
      db.close()
    }
  }
  expect(count()).toBe(2)
  store.close()
  store = createAuthStore(join(directory, 'game.db'), { now: () => time })
  expect(count()).toBe(1)
  expect(store.user(live.token)).toEqual(live.user)
  expect(store.user(expired.token)).toBeNull()
})
it('rejects duplicate and concurrent registration without creating a second identity', async () => {
  const results = await Promise.allSettled([
    store.register('race_player', password),
    store.register('RACE_PLAYER', password),
  ])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((r) => r.status === 'rejected').reason.status).toBe(409)
  const winner = results.find((r) => r.status === 'fulfilled').value
  expect(store.user(winner.token)).toEqual(winner.user)
})
it('bounds concurrent hashing and resets persisted attempt limits only after the window', async () => {
  const first = store.register('busy_one', password)
  const second = store.register('busy_two', password)
  await expect(store.register('busy_three', password)).rejects.toMatchObject({ status: 503 })
  await Promise.all([first, second])
  store.consumeAttempt('ip:test', 2)
  store.consumeAttempt('ip:test', 2)
  expect(() => store.consumeAttempt('ip:test', 2)).toThrow('尝试次数过多')
  store.close()
  store = createAuthStore(join(directory, 'game.db'), { now: () => time })
  expect(() => store.consumeAttempt('ip:test', 2)).toThrow('尝试次数过多')
  time += ATTEMPT_WINDOW
  expect(() => store.consumeAttempt('ip:test', 2)).not.toThrow()
})
it('reports the same error for unknown users and wrong password case', async () => {
  await store.register('known', password)
  await expect(store.login('unknown', password)).rejects.toMatchObject({
    status: 401,
    message: '账号或密码错误。',
  })
  await expect(store.login('known', password.toLowerCase())).rejects.toMatchObject({
    status: 401,
    message: '账号或密码错误。',
  })
})

it('limits ten failed attempts per account and a successful login resets that account counter', async () => {
  const first = await store.register('attempt_player', password)
  for (let index = 0; index < 9; index++)
    await expect(store.login('attempt_player', 'wrong_password')).rejects.toMatchObject({
      status: 401,
    })
  const next = await store.login('attempt_player', password)
  expect(store.user(first.token)).toBeNull()
  expect(store.user(next.token)).toEqual(next.user)
  for (let index = 0; index < 10; index++)
    await expect(store.login('attempt_player', 'wrong_password')).rejects.toMatchObject({
      status: 401,
    })
  await expect(store.login('attempt_player', password)).rejects.toMatchObject({ status: 429 })
  expect(store.user(next.token)).toEqual(next.user)
  time += ATTEMPT_WINDOW
  await expect(store.login('attempt_player', password)).resolves.toMatchObject({ user: next.user })
})
