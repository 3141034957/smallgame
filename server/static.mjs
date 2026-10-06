import { readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.ico', '.txt', '.xml'])

// RFC 9110 §12.5.3: exact coding tokens, quality weights, explicit exclusions
// and wildcard fallback. Identity is acceptable unless specifically excluded.
export function negotiateEncoding(header, available = ['br', 'gzip']) {
  const weights = new Map()
  for (const entry of String(header ?? '')
    .toLowerCase()
    .split(',')) {
    const [name, ...parameters] = entry.trim().split(';')
    if (!name) continue
    const quality = parameters.map((value) => value.trim()).find((value) => value.startsWith('q='))
    const weight = quality === undefined ? 1 : Number(quality.slice(2))
    weights.set(name.trim(), Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0)
  }
  let chosen = null,
    best = 0
  for (const name of available) {
    const weight = weights.get(name) ?? weights.get('*') ?? 0
    if (weight > best) {
      chosen = name
      best = weight
    }
  }
  const identity = weights.get('identity') ?? (weights.get('*') === 0 ? 0 : 1)
  if (weights.has('identity') && identity > best) return 'identity'
  return chosen ?? (identity > 0 ? 'identity' : null)
}

export function createStaticHandler(clientDirectory) {
  const root = resolve(clientDirectory)
  const index = resolve(root, 'index.html')
  const encodedCache = new Map()

  return function sendStatic(req, res, pathname) {
    const reject = (status, message, headers = {}) => {
      res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers,
      })
      res.end(req.method === 'HEAD' ? undefined : message)
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      reject(405, 'Method not allowed', { Allow: 'GET, HEAD' })
      return
    }
    let decoded
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      reject(400, 'Invalid path')
      return
    }
    if (!decoded.startsWith('/') || decoded.includes('\0')) {
      reject(400, 'Invalid path')
      return
    }
    let filePath = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`)
    const path = relative(root, filePath)
    if (path === '..' || path.startsWith(`..${sep}`)) {
      reject(403, 'Forbidden')
      return
    }
    const isAsset = path === 'assets' || path.startsWith(`assets${sep}`)
    let content, stat
    try {
      stat = statSync(filePath)
      if (!stat.isFile()) throw new Error('Not a file')
      content = readFileSync(filePath)
    } catch {
      // Missing build assets must never become immutable cached HTML. Only
      // page routes can use the SPA entry, with its real MIME/cache metadata.
      if (isAsset || !['', '.html'].includes(extname(filePath))) {
        reject(404, 'Not found')
        return
      }
      filePath = index
      try {
        stat = statSync(index)
        content = readFileSync(index)
      } catch {
        reject(404, 'Not found')
        return
      }
    }
    const ext = extname(filePath).toLowerCase()
    const compressible = COMPRESSIBLE.has(ext)
    const accept = req.headers['accept-encoding']
    const allowIdentity = negotiateEncoding(accept, []) === 'identity'
    const available =
      compressible && (content.length >= 1024 || !allowIdentity) ? ['br', 'gzip'] : []
    const encoding = negotiateEncoding(accept, available)
    if (!encoding) {
      reject(406, 'No acceptable content encoding', { Vary: 'Accept-Encoding' })
      return
    }
    const headers = {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control':
        ext === '.html'
          ? 'no-cache'
          : isAsset
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
      // Also vary uncompressed responses, so intermediary caches cannot reuse
      // one client's chosen representation for a client with other encodings.
      Vary: 'Accept-Encoding',
    }
    let body = content
    if (encoding !== 'identity') {
      const key = `${filePath}:${stat.mtimeMs}:${stat.size}:${encoding}`
      body = encodedCache.get(key)
      if (!body) {
        body =
          encoding === 'br'
            ? brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
            : gzipSync(content, { level: 6 })
        if (encodedCache.size >= 64) encodedCache.clear()
        encodedCache.set(key, body)
      }
      headers['Content-Encoding'] = encoding
    }
    headers['Content-Length'] = body.length
    res.writeHead(200, headers)
    res.end(req.method === 'HEAD' ? undefined : body)
  }
}
