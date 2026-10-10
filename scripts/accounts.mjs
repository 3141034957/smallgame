// Account tools for the running game database.
//   node scripts/accounts.mjs list
//   node scripts/accounts.mjs sessions <昵称>
// Accounts are nickname-only: there is no password to reset, so a stolen
// nickname can only be handled by renaming or removing the account.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { normalizeAccount } from '../src/features/auth/validation.mjs'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDirectory = process.env.DATA_DIR || join(projectDirectory, 'server', 'data')
const databasePath = join(dataDirectory, 'game.db')
const [command, username] = process.argv.slice(2)

const db = new DatabaseSync(databasePath)
try {
  if (command === 'list') {
    const rows = db
      .prepare(
        `SELECT a.username, a.created_at,
                (SELECT COUNT(*) FROM account_progress p WHERE p.account_id = a.id) AS saved,
                (SELECT COUNT(*) FROM account_sessions s WHERE s.account_id = a.id) AS sessions
         FROM accounts a ORDER BY a.created_at`,
      )
      .all()
    console.log(`账号数据库：${databasePath}`)
    console.table(
      rows.map((row) => ({
        账号: row.username,
        创建时间: new Date(row.created_at).toISOString().slice(0, 19).replace('T', ' '),
        已保存进度: row.saved ? '是' : '否',
        在线会话: row.sessions,
      })),
    )
    console.log(`共 ${rows.length} 个账号。账号只认昵称，没有密码。`)
  } else if (command === 'sessions') {
    const account = normalizeAccount(username)
    if (!account) throw new Error('请给出昵称。')
    const row = db.prepare('SELECT id, username FROM accounts WHERE username=?').get(account)
    if (!row) throw new Error(`账号不存在：${account}`)
    // Without a password, dropping the sessions is the only way to kick someone
    // out of a nickname they are not supposed to be using.
    const dropped = db
      .prepare('DELETE FROM account_sessions WHERE account_id=?')
      .run(row.id).changes
    console.log(`已让 ${row.username} 的 ${dropped} 个登录失效，进度仍在库中。`)
  } else {
    console.log(`用法：
  node scripts/accounts.mjs list
  node scripts/accounts.mjs sessions <昵称>

账号只认昵称、没有密码；sessions 只让现有登录失效，不删进度。可用 DATA_DIR 指定数据库目录。`)
  }
} finally {
  db.close()
}
