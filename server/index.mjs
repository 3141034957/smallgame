import { createServer } from 'node:http'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFarmStore } from './farm-store.mjs'
import { handleFarmRequest } from './farm.mjs'
import { createStaticHandler } from './static.mjs'
import { createAuthStore } from './auth-store.mjs'
import { createAuthHandler, allowAccountWrite } from './auth.mjs'
import { handleProgressRequest } from './progress.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const databasePath = join(process.env.DATA_DIR || join(directory, 'data'), 'game.db')
const store = createFarmStore(databasePath)
const accounts = createAuthStore(databasePath)
const auth = createAuthHandler(accounts)
const sendStatic = createStaticHandler(join(directory, '..', 'dist', 'client'))

const server = createServer((req, res) => {
  let url
  try {
    // Routing must not depend on an untrusted Host header.
    url = new URL(req.url, 'http://localhost')
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: 'invalid request URL' }))
    return
  }

  // Account cookies are same-origin; do not expose credentialed APIs via CORS.
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (url.pathname.startsWith('/api/auth/')) {
    void auth.handle(req, res, url)
    return
  }
  if (url.pathname === '/api/progress') {
    void handleProgressRequest(req, res, accounts, () => auth.authenticate(req))
    return
  }
  if (url.pathname.startsWith('/api/farm/')) {
    if (req.method === 'POST' && !allowAccountWrite(req, res)) return
    void handleFarmRequest(req, res, url, store, () => auth.authenticate(req))
    return
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: 'API not found' }))
    return
  }
  sendStatic(req, res, url.pathname)
})

server.listen(process.env.PORT || 3001, () => {
  console.log(`🌐 Server running at http://localhost:${server.address().port}`)
  console.log(`🗄️ Database stored at ${databasePath}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      store.close()
      accounts.close()
      process.exit(0)
    })
  })
}
