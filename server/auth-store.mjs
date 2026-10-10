import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { normalizeAccount, ACCOUNT_HINT } from '../src/features/auth/validation.mjs'
import { validProgress } from '../src/features/auth/progress.mjs'

export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
export const ATTEMPT_WINDOW = 15 * 60 * 1000
const digest = (token) => createHash('sha256').update(token).digest('hex')
export class AuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function createAuthStore(path, { now = Date.now } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS account_sessions (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id), token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS auth_attempts (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS account_progress (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id), data TEXT NOT NULL,
      revision INTEGER NOT NULL, updated_at INTEGER NOT NULL
    ) STRICT;`)
  // Expired sessions are invisible to user() already; drop them so the table
  // does not grow forever on a long-running server.
  db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now())
  let busy = 0
  async function expensive(action) {
    if (busy >= 2) throw new AuthError(503, '登录服务正在忙碌，请稍后重试。')
    busy++
    try {
      return await action()
    } finally {
      busy--
    }
  }
  function createSession(user) {
    const token = randomBytes(32).toString('base64url')
    db.prepare(
      `INSERT INTO account_sessions(account_id,token_hash,expires_at) VALUES(?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at`,
    ).run(user.id, digest(token), now() + SESSION_TTL)
    return { user, token }
  }
  return {
    consumeAttempt(key, limit) {
      const time = now()
      db.prepare('DELETE FROM auth_attempts WHERE expires_at <= ?').run(time)
      db.prepare(
        `INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?)
        ON CONFLICT(key) DO UPDATE SET count=count+1`,
      ).run(key, time + ATTEMPT_WINDOW)
      if (db.prepare('SELECT count FROM auth_attempts WHERE key=?').get(key).count > limit)
        throw new AuthError(429, '尝试次数过多，请 15 分钟后重试。')
    },
    // A nickname is the whole identity: entering one loads that band, and a
    // nickname nobody has claimed yet is created with the guest progress sent
    // along. There is no password, so nothing here can verify one.
    enter(account, progress = {}) {
      const username = normalizeAccount(account)
      if (!username) throw new AuthError(400, ACCOUNT_HINT)
      if (!validProgress(progress))
        throw new AuthError(400, '进度格式错误或内容过大，原存档仍保留在本机。')
      this.consumeAttempt(`account:${username}`, 30)
      // The cap stays even without a slow hash: it is the only backstop when a
      // client hammers the endpoint with fresh nicknames.
      return expensive(() => {
        const existing = db
          .prepare('SELECT id, username FROM accounts WHERE username=?')
          .get(username)
        if (existing) return createSession({ id: existing.id, username: existing.username })
        const progressJSON = JSON.stringify(progress)
        const user = { id: `account_${randomUUID()}`, username }
        db.exec('BEGIN IMMEDIATE')
        try {
          db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(user.id, username, '', now())
          db.prepare('INSERT INTO account_progress VALUES(?,?,1,?)').run(
            user.id,
            progressJSON,
            now(),
          )
          const session = createSession(user)
          db.exec('COMMIT')
          return session
        } catch (error) {
          db.exec('ROLLBACK')
          const taken = db
            .prepare('SELECT id, username FROM accounts WHERE username=?')
            .get(username)
          if (taken) return createSession({ id: taken.id, username: taken.username })
          throw error
        }
      })
    },
    progress(id) {
      const row = db
        .prepare('SELECT data,revision FROM account_progress WHERE account_id=?')
        .get(id)
      return row
        ? { data: JSON.parse(row.data), revision: row.revision }
        : { data: {}, revision: 0 }
    },
    saveProgress(id, data, revision) {
      if (!validProgress(data) || !Number.isSafeInteger(revision) || revision < 0)
        throw new AuthError(400, '进度格式错误。')
      const current = this.progress(id)
      if (current.revision !== revision) {
        // Retrying an acknowledged write after losing the response is harmless.
        const keys = Object.keys(data)
        if (
          keys.length === Object.keys(current.data).length &&
          keys.every((key) => data[key] === current.data[key])
        )
          return current
        throw new AuthError(409, '云端进度已在另一处更新，本机进度已保留，请重新载入云端进度。')
      }
      const write = db
        .prepare(
          `INSERT INTO account_progress VALUES(?,?,?,?)
        ON CONFLICT(account_id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at
        WHERE account_progress.revision=?`,
        )
        .run(id, JSON.stringify(data), revision + 1, now(), revision)
      if (!write.changes)
        throw new AuthError(409, '云端进度已更新，本机进度已保留，请重新载入云端进度。')
      return { data, revision: revision + 1 }
    },
    login(account, progress = {}) {
      return this.enter(account, progress)
    },
    register(account, progress = {}) {
      return this.enter(account, progress)
    },
    user(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
      const row = db
        .prepare(
          `SELECT accounts.id,accounts.username FROM account_sessions
        JOIN accounts ON accounts.id=account_sessions.account_id WHERE token_hash=? AND expires_at>?`,
        )
        .get(digest(token), now())
      return row ? { id: row.id, username: row.username } : null
    },
    logout(token) {
      if (typeof token === 'string')
        db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(digest(token))
    },
    close: () => db.close(),
  }
}
