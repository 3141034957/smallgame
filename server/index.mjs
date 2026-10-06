import { createServer } from 'node:http'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFarmStore } from './farm-store.mjs'
import { handleFarmRequest } from './farm.mjs'
import { createStaticHandler } from './static.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const databasePath = join(process.env.DATA_DIR || join(directory, 'data'), 'game.db')
const store = createFarmStore(databasePath)
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

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (url.pathname.startsWith('/api/farm/')) {
    void handleFarmRequest(req, res, url, store)
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
      process.exit(0)
    })
  })
}
