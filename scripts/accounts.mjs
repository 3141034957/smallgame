// Account tools for the running game database.
//   node scripts/accounts.mjs list
//   node scripts/accounts.mjs reset <账号> <新密码>
// Passwords are stored as salted scrypt hashes, so they can be replaced but
// never read back: there is no way to recover the password a player chose.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { hashPassword } from '../server/auth-store.mjs'
import { normalizeAccount, validPassword, PASSWORD_HINT } from '../src/features/auth/validation.mjs'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDirectory = process.env.DATA_DIR || join(projectDirectory, 'server', 'data')
const databasePath = join(dataDirectory, 'game.db')
const [command, username, password] = process.argv.slice(2)

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
    console.log(`共 ${rows.length} 个账号。密码以加盐哈希保存，无法查看，只能重置。`)
  } else if (command === 'reset') {
    const account = normalizeAccount(username)
    if (!account) throw new Error('请给出要重置的账号名。')
    if (!validPassword(password)) throw new Error(`新密码不符合规则：${PASSWORD_HINT}`)
    const row = db.prepare('SELECT id, username FROM accounts WHERE username=?').get(account)
    if (!row) throw new Error(`账号不存在：${account}`)
    db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(
      await hashPassword(password),
      row.id,
    )
    // An old session should not keep working after a password change.
    db.prepare('DELETE FROM account_sessions WHERE account_id=?').run(row.id)
    console.log(`已重置 ${row.username} 的密码，并让其此前的登录失效。`)
  } else {
    console.log(`用法：
  node scripts/accounts.mjs list
  node scripts/accounts.mjs reset <账号> <新密码>

密码为加盐哈希，无法查看，只能重置。可用 DATA_DIR 指定数据库目录。`)
  }
} finally {
  db.close()
}
