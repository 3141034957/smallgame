import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { createStaticHandler, negotiateEncoding } from './static.mjs'

let root, send, html, script
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'smallgame-static-'))
  mkdirSync(join(root, 'client/assets'), { recursive: true })
  html = '<!doctype html><html>' + '首页内容'.repeat(400) + '</html>'
  script = 'console.log("' + 'music'.repeat(400) + '")'
  writeFileSync(join(root, 'client/index.html'), html)
  writeFileSync(join(root, 'client/assets/game-test.js'), script)
  writeFileSync(join(root, 'client/assets/icon.svg'), '<svg/>')
  writeFileSync(join(root, 'client/hello world.txt'), 'hello')
  // A similarly prefixed directory is outside the static root too.
  mkdirSync(join(root, 'client-private'))
  writeFileSync(join(root, 'client-private/secret.txt'), 'private')
  send = createStaticHandler(join(root, 'client'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function response(path = '/', accept, method = 'GET') {
  const result = {}
  send(
    { method, headers: { 'accept-encoding': accept } },
    {
      writeHead(status, headers) {
        result.status = status
        result.headers = headers
      },
      end(body) {
        result.body = body
      },
    },
    path,
  )
  return result
}

describe('static response correctness', () => {
  it('serves page fallbacks as HTML without caching them as assets', () => {
    for (const path of ['/', '/farm', '/rhythm', '/old-page.html']) {
      const result = response(path)
      expect(result.status).toBe(200)
      expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8')
      expect(result.headers['Cache-Control']).toBe('no-cache')
      expect(result.body.toString()).toBe(html)
    }
  })
  it('returns 404 for missing assets instead of caching HTML under their filenames', () => {
    for (const path of [
      '/assets/removed.js',
      '/assets/removed.css',
      '/assets/missing',
      '/missing.png',
    ]) {
      const result = response(path)
      expect(result.status).toBe(404)
      expect(result.headers['Cache-Control']).toBe('no-store')
      expect(result.body).not.toContain('<html>')
    }
    expect(response('/assets/game-test.js').headers['Cache-Control']).toContain('immutable')
  })
  it('honors encoding quality and exclusions and varies every representation', () => {
    const gzip = response('/', 'br;q=0, gzip;q=1')
    expect(gzip.headers['Content-Encoding']).toBe('gzip')
    expect(gunzipSync(gzip.body).toString()).toBe(html)
    const br = response('/', 'gzip;q=0.2, BR;q=0.8')
    expect(br.headers['Content-Encoding']).toBe('br')
    expect(brotliDecompressSync(br.body).toString()).toBe(html)
    const plain = response('/', 'br;q=0, gzip;q=0')
    expect(plain.headers['Content-Encoding']).toBeUndefined()
    expect(plain.body.toString()).toBe(html)
    for (const result of [gzip, br, plain]) expect(result.headers.Vary).toBe('Accept-Encoding')
  })
  it('does not silently send an explicitly forbidden identity representation', () => {
    expect(response('/', 'br;q=0, gzip;q=0, identity;q=0').status).toBe(406)
    const small = response('/assets/icon.svg', 'gzip, identity;q=0')
    expect(small.status).toBe(200)
    expect(small.headers['Content-Encoding']).toBe('gzip')
    expect(gunzipSync(small.body).toString()).toBe('<svg/>')
  })
  it('handles HEAD and refuses unsupported methods', () => {
    const get = response('/assets/game-test.js', 'gzip')
    const head = response('/assets/game-test.js', 'gzip', 'HEAD')
    expect(head.status).toBe(200)
    expect(head.headers).toEqual(get.headers)
    expect(head.body).toBeUndefined()
    expect(response('/missing.js', undefined, 'HEAD').body).toBeUndefined()
    const post = response('/', undefined, 'POST')
    expect(post.status).toBe(405)
    expect(post.headers.Allow).toBe('GET, HEAD')
  })
  it('decodes legitimate filenames but refuses escaped paths and malformed escapes', () => {
    expect(response('/hello%20world.txt').body.toString()).toBe('hello')
    expect(response('/%2e%2e%2fclient-private/secret.txt').status).toBe(403)
    expect(response('/%zz').status).toBe(400)
    expect(response('/%00').status).toBe(400)
  })
  it('returns 404 when even the SPA entry is absent', () => {
    rmSync(join(root, 'client/index.html'))
    expect(response('/farm').status).toBe(404)
  })
})

it('negotiates exact tokens, wildcards and explicit identity preferences', () => {
  expect(negotiateEncoding('zebra')).toBe('identity')
  expect(negotiateEncoding('gzip;q=0.5, br;q=0.2')).toBe('gzip')
  expect(negotiateEncoding('br;q=0, *;q=0.5')).toBe('gzip')
  expect(negotiateEncoding('gzip;q=0.5, identity;q=1')).toBe('identity')
  expect(negotiateEncoding('*;q=0')).toBeNull()
  expect(negotiateEncoding('gzip;q=invalid')).toBe('identity')
})
