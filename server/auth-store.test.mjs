import { beforeEach, afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthStore, SESSION_TTL, ATTEMPT_WINDOW } from './auth-store.mjs'
import { createFarmStore } from './farm-store.mjs'
import { normalizeAccount, ACCOUNT_HINT } from '../src/features/auth/validation.mjs'
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
const progress = { 'farm-career-v1': '{"runs":3}' }
const otherProgress = { 'farm-career-v1': '{"runs":99}' }
// A bad nickname or a spent quota throws before the async work starts, while
// the busy guard rejects: take both so the assertion does not care which.
async function failure(run) {
  try {
    await run()
    return null
  } catch (error) {
    return error
  }
}

it('accepts 3-32 letters, digits and _ only, and lowercases the nickname', () => {
  expect(normalizeAccount(' My_Player ')).toBe('my_player')
  expect(normalizeAccount('ABC123')).toBe('abc123')
  for (const valid of ['abc', 'a_1', 'x'.repeat(32)]) expect(normalizeAccount(valid)).not.toBeNull()
  for (const invalid of [
    null,
    undefined,
    '',
    'ab',
    'bad-name',
    'bad name',
    '用户名',
    'x'.repeat(33),
  ])
    expect(normalizeAccount(invalid)).toBeNull()
})
it('rejects a malformed nickname with the hint instead of touching the database', async () => {
  for (const invalid of ['ab', 'bad name', '用户名', 'x'.repeat(33)])
    expect(await failure(() => store.enter(invalid, progress))).toMatchObject({
      status: 400,
      message: ACCOUNT_HINT,
    })
  const db = new DatabaseSync(join(directory, 'game.db'))
  try {
    expect(db.prepare('SELECT COUNT(*) AS total FROM accounts').get().total).toBe(0)
  } finally {
    db.close()
  }
})
it('writes an empty password hash and only hashed sessions, never plaintext secrets', async () => {
  const a = await store.enter('Player_1', progress)
  const b = await store.enter('Player_2', progress)
  const db = new DatabaseSync(join(directory, 'game.db'))
  const rows = db.prepare('SELECT password_hash FROM accounts').all()
  expect(rows).toHaveLength(2)
  // Nicknames are the whole identity now: there is nothing left to hash.
  expect(rows.every((row) => row.password_hash === '')).toBe(true)
  const serialized = JSON.stringify([
    ...rows,
    ...db.prepare('SELECT * FROM account_sessions').all(),
  ])
  expect(serialized).not.toContain(a.token)
  expect(serialized).not.toContain(b.token)
  db.close()
  expect(store.user(a.token)).toEqual(a.user)
  expect(store.user(`${a.token}x`)).toBeNull()
})
it('creates the band with the guest progress and keeps that save when the nickname enters again', async () => {
  const created = await store.enter('player', progress)
  expect(store.progress(created.user.id)).toEqual({ data: progress, revision: 1 })
  // The nickname is the identity, so a second visit is a login: the progress it
  // brings along must never overwrite the save already stored under that name.
  const again = await store.enter('PLAYER', otherProgress)
  expect(again.user).toEqual(created.user)
  expect(store.progress(created.user.id)).toEqual({ data: progress, revision: 1 })
  const db = new DatabaseSync(join(directory, 'game.db'))
  try {
    expect(db.prepare('SELECT COUNT(*) AS total FROM accounts').get().total).toBe(1)
  } finally {
    db.close()
  }
})
it('lets a legacy row with an old password hash enter without ever checking it', async () => {
  // Migration point: accounts created before nicknames became passwordless
  // still carry a scrypt hash, and the hash must not become a lockout.
  const legacyHash = `scrypt$32768$8$3$${'a'.repeat(32)}${'b'.repeat(64)}`
  const db = new DatabaseSync(join(directory, 'game.db'))
  db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(
    'account_legacy',
    'legacy_player',
    legacyHash,
    time,
  )
  db.close()
  const result = await store.enter('legacy_player', progress)
  expect(result.user).toEqual({ id: 'account_legacy', username: 'legacy_player' })
  expect(store.progress('account_legacy')).toEqual({ data: {}, revision: 0 })
  const reopened = new DatabaseSync(join(directory, 'game.db'))
  try {
    expect(
      reopened.prepare('SELECT password_hash FROM accounts WHERE id=?').get('account_legacy')
        .password_hash,
    ).toBe(legacyHash)
  } finally {
    reopened.close()
  }
})
it('replaces only the same account session and old logout cannot delete the new login', async () => {
  const first = await store.enter('player', progress)
  const other = await store.enter('other', progress)
  expect(store.user(first.token)).toEqual(first.user)
  const next = await store.enter('PLAYER', otherProgress)
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
  const result = await store.enter('persist', progress)
  store.close()
  store = createAuthStore(join(directory, 'game.db'), { now: () => time })
  expect(store.user(result.token)).toEqual(result.user)
  time += SESSION_TTL
  expect(store.user(result.token)).toBeNull()
  const renewed = await store.enter('persist', otherProgress)
  expect(store.user(renewed.token)).toEqual(result.user)
  expect(store.progress(result.user.id)).toEqual({ data: progress, revision: 1 })
  expect(farm.boardAcrossDays('farm:', 'farm').data).toEqual([])
  farm.close()
})
it('purges expired sessions on startup so the table cannot grow forever', async () => {
  const expired = await store.enter('expired_player', progress)
  time += SESSION_TTL
  const live = await store.enter('live_player', progress)
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
it('collapses concurrent enters of one nickname into a single identity', async () => {
  const results = await Promise.allSettled([
    store.enter('race_player', progress),
    store.enter('RACE_PLAYER', otherProgress),
  ])
  expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
  const [first, second] = results.map((r) => r.value)
  expect(second.user).toEqual(first.user)
  const db = new DatabaseSync(join(directory, 'game.db'))
  try {
    expect(db.prepare('SELECT COUNT(*) AS total FROM accounts').get().total).toBe(1)
  } finally {
    db.close()
  }
  expect(store.progress(first.user.id)).toEqual({ data: progress, revision: 1 })
})
it('bounds concurrent enters at two and resets persisted attempt limits only after the window', async () => {
  const first = store.enter('busy_one', progress)
  const second = store.enter('busy_two', progress)
  expect(await failure(() => store.enter('busy_three', progress))).toMatchObject({ status: 503 })
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
it('limits thirty enters per nickname and refuses without dropping the current session', async () => {
  let last
  for (let index = 0; index < 30; index++) last = await store.enter('attempt_player', progress)
  const identity = last.user
  expect(await failure(() => store.enter('attempt_player', progress))).toMatchObject({
    status: 429,
    message: '尝试次数过多，请 15 分钟后重试。',
  })
  expect(store.user(last.token)).toEqual(identity)
  time += ATTEMPT_WINDOW
  await expect(store.enter('attempt_player', otherProgress)).resolves.toMatchObject({
    user: identity,
  })
  expect(store.progress(identity.id)).toEqual({ data: progress, revision: 1 })
})
