import { afterAll, beforeAll, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

let child, closed, directory, port
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'smallgame-http-'))
  child = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', DATA_DIR: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  closed = once(child, 'close')
  await new Promise((resolve, reject) => {
    let output = '',
      errors = ''
    const timer = setTimeout(() => reject(new Error(`测试服务启动超时：${errors}`)), 5000)
    child.stderr.on('data', (chunk) => {
      errors += chunk
    })
    child.once('close', () => {
      clearTimeout(timer)
      reject(new Error(`测试服务提前退出：${errors}`))
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = output.match(/Server running at http:\/\/localhost:(\d+)/)
      if (match) {
        clearTimeout(timer)
        port = Number(match[1])
        resolve()
      }
    })
  })
}, 10000)

afterAll(async () => {
  if (child?.exitCode === null) child.kill('SIGTERM')
  if (closed) await closed
  if (directory) rmSync(directory, { recursive: true, force: true })
})

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, headers, agent: false }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        text += chunk
      })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
      res.on('error', reject)
    })
    req.setTimeout(3000, () => req.destroy(new Error('测试请求超时')))
    req.on('error', reject)
    req.end()
  })
}

it('survives a malformed Host header and continues serving the leaderboard', async () => {
  const result = await get('/api/farm/leaderboard', { Host: '[' })
  expect(result.status).toBe(200)
  expect(JSON.parse(result.text).data).toEqual([])
  expect((await get('/api/farm/leaderboard')).status).toBe(200)
  expect(child.exitCode).toBeNull()
})

it('rejects invalid request URLs without terminating the process', async () => {
  const result = await get('http://[')
  expect(result.status).toBe(400)
  expect(JSON.parse(result.text).error).toBe('invalid request URL')
  expect((await get('/api/farm/leaderboard')).status).toBe(200)
})

it('returns JSON 404 for unknown APIs instead of a page or cached asset', async () => {
  const result = await get('/api/does-not-exist')
  expect(result.status).toBe(404)
  expect(result.headers['content-type']).toContain('application/json')
  expect(JSON.parse(result.text).error).toBe('API not found')
})

it('preserves Chinese nicknames when request chunks split a UTF-8 character', async () => {
  const body = Buffer.from(
    JSON.stringify({
      playerId: 'http-test-player',
      name: '快乐小猫',
      score: 123,
      characterId: 'bear-drums',
    }),
  )
  const split = body.indexOf(Buffer.from('快')) + 1
  let req
  const submitted = new Promise((resolve, reject) => {
    req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/score',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
        agent: false,
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.setTimeout(3000, () => req.destroy(new Error('测试提交超时')))
  })
  req.write(body.subarray(0, split))
  await delay(30)
  req.end(body.subarray(split))
  expect(await submitted).toBe(200)
  const board = JSON.parse((await get('/api/leaderboard')).text)
  expect(board.data).toContainEqual(expect.objectContaining({ name: '快乐小猫', score: 123 }))
})
