import { expect, it, vi } from 'vitest'
import { createServer as createBackend } from 'node:http'
import { createServer as createViteServer } from 'vite'
import { apiProxyTarget } from './api-proxy.mjs'

it('uses IPs for local defaults and configurable remote IPv4 and IPv6 backends', () => {
  expect(apiProxyTarget()).toBe('http://127.0.0.1:3001')
  expect(apiProxyTarget({ GAME_API_IP: ' 192.0.2.10 ', GAME_API_PORT: '80' })).toBe(
    'http://192.0.2.10:80',
  )
  expect(apiProxyTarget({ GAME_API_IP: '::1', GAME_API_PORT: '65535' })).toBe('http://[::1]:65535')
})
it('refuses domains, URL fragments, invalid IPs and ports rather than contacting the wrong backend', () => {
  for (const ip of [
    'localhost',
    'example.com',
    'http://192.0.2.10',
    '192.0.2.10/path',
    '999.1.1.1',
  ])
    expect(() => apiProxyTarget({ GAME_API_IP: ip })).toThrow('有效的 IPv4 或 IPv6')
  for (const port of ['0', '65536', '-1', '1.5', '80/path'])
    expect(() => apiProxyTarget({ GAME_API_PORT: port })).toThrow('端口号')
})

it('proxies login JSON and cookies through the actual Vite IP configuration', async () => {
  let forwarded
  const backend = createBackend(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    forwarded = {
      path: req.url,
      method: req.method,
      headers: req.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'echo_proxy_test=fake; HttpOnly; SameSite=Lax; Path=/',
    })
    res.end(JSON.stringify({ ok: true }))
  })
  let frontend
  try {
    await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve))
    const port = backend.address().port
    vi.stubEnv('GAME_API_IP', '127.0.0.1')
    vi.stubEnv('GAME_API_PORT', String(port))
    frontend = await createViteServer({
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    expect(frontend.config.server.proxy['/api'].target).toBe(`http://127.0.0.1:${port}`)
    expect(frontend.config.preview.proxy['/api'].target).toBe(`http://127.0.0.1:${port}`)
    await frontend.listen()
    const response = await fetch(
      `http://127.0.0.1:${frontend.httpServer.address().port}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Echo-Request': '1' },
        body: JSON.stringify({ account: 'ip_player', password: ' Aa1!<> &+/% ' }),
      },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax')
    expect(forwarded).toMatchObject({
      path: '/api/auth/login',
      method: 'POST',
      headers: { host: `127.0.0.1:${port}`, 'x-echo-request': '1' },
      body: { account: 'ip_player', password: ' Aa1!<> &+/% ' },
    })
  } finally {
    if (frontend) await frontend.close()
    await new Promise((resolve) => backend.close(resolve))
    vi.unstubAllEnvs()
  }
})
