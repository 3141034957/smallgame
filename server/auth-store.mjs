import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import {
  normalizeAccount,
  validPassword,
  ACCOUNT_HINT,
  PASSWORD_HINT,
} from '../src/features/auth/validation.mjs'
import { validProgress } from '../src/features/auth/progress.mjs'

export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
export const ATTEMPT_WINDOW = 15 * 60 * 1000
const derive = promisify(scrypt)
const HASH_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const digest = (token) => createHash('sha256').update(token).digest('hex')
export class AuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await derive(password, salt, 32, HASH_OPTIONS)
  return `scrypt$32768$8$3$${salt.toString('base64url')}$${hash.toString('base64url')}`
}
async function verifyPassword(password, stored) {
  const parts = stored?.split('$')
  const valid = parts?.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$32768$8$3'
  // Unknown users pay the same derivation cost as known users.
  const salt = valid ? Buffer.from(parts[4], 'base64url') : Buffer.alloc(16)
  const expected = valid ? Buffer.from(parts[5], 'base64url') : Buffer.alloc(32)
  const actual = await derive(password, salt, 32, HASH_OPTIONS)
  return expected.length === actual.length && timingSafeEqual(actual, expected) && valid
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
    async register(account, password, progress = {}) {
      const username = normalizeAccount(account)
      if (!username) throw new AuthError(400, ACCOUNT_HINT)
      if (!validPassword(password)) throw new AuthError(400, PASSWORD_HINT)
      if (!validProgress(progress))
        throw new AuthError(400, '进度格式错误或内容过大，原存档仍保留在本机。')
      const progressJSON = JSON.stringify(progress)
      if (db.prepare('SELECT id FROM accounts WHERE username=?').get(username))
        throw new AuthError(409, '这个账号已被注册，请换一个账号或直接登录。')
      return expensive(async () => {
        const hash = await hashPassword(password)
        const user = { id: `account_${randomUUID()}`, username }
        db.exec('BEGIN IMMEDIATE')
        try {
          db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(user.id, username, hash, now())
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
          if (db.prepare('SELECT id FROM accounts WHERE username=?').get(username))
            throw new AuthError(409, '这个账号已被注册，请换一个账号或直接登录。')
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
    async login(account, password) {
      const username = normalizeAccount(account)
      if (!username || !validPassword(password)) throw new AuthError(401, '账号或密码错误。')
      this.consumeAttempt(`account:${username}`, 10)
      return expensive(async () => {
        const row = db.prepare('SELECT * FROM accounts WHERE username=?').get(username)
        if (!(await verifyPassword(password, row?.password_hash)))
          throw new AuthError(401, '账号或密码错误。')
        db.prepare('DELETE FROM auth_attempts WHERE key=?').run(`account:${username}`)
        return createSession({ id: row.id, username: row.username })
      })
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
