import { afterAll, beforeAll, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { createFarm, chooseTalent, stepFarm, replayFarm, FPS } from '../src/features/farm/rules.mjs'

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

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        agent: false,
        headers: { 'Content-Type': 'application/json', 'X-Echo-Request': '1', ...headers },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text) }),
        )
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('测试请求超时')))
    req.end(JSON.stringify(body))
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
  const registered = await post('/api/auth/register', {
    account: 'http_test_player',
    password: 'Mixed_Aa1!<>"&+',
  })
  expect(registered.status).toBe(200)
  const cookie = registered.headers['set-cookie'][0].split(';')[0]
  const day = '2026-10-04'
  let state = createFarm(day)
  const frames = [],
    choices = []
  while (state.hp > 0 && frames.length < FPS * 600) {
    while (state.offered.length) {
      const id = state.offered[0]
      choices.push({ tick: state.tick, id })
      state = chooseTalent(state, id)
    }
    const point = [...state.position]
    frames.push(point)
    state = stepFarm(state, point, false).state
  }
  const round = replayFarm(day, frames, choices, [])
  expect(round).not.toBeNull()
  const body = Buffer.from(
    JSON.stringify({
      ...round,
      playerId: 'http-test-player',
      name: '快乐小猫',
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
        path: '/api/farm/score',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          'X-Echo-Request': '1',
          'X-Echo-User': registered.data.user.id,
          Cookie: cookie,
        },
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
  const board = JSON.parse((await get('/api/farm/leaderboard')).text)
  expect(board.data).toContainEqual(
    expect.objectContaining({ name: '快乐小猫', score: round.score }),
  )
  const own = JSON.parse(
    (await get('/api/farm/leaderboard?playerId=http-test-player', { Cookie: cookie })).text,
  )
  expect(own.own).toMatchObject({ name: '快乐小猫', score: round.score, isYou: true })
  expect(board.own).toBeNull()
})

it('uses one persistent session, inherits guest progress and protects account writes over IP', async () => {
  const progress = { 'farm-career-v1': '{"runs":7}', 'farm-character-profile-v1': '{"coins":1234}' }
  expect(JSON.parse((await get('/api/auth/session')).text)).toEqual({ user: null })
  const registered = await post('/api/auth/register', {
    account: 'single_http',
    password: 'Aa1!"<> &+/%',
    progress,
  })
  expect(registered.status).toBe(200)
  expect(registered.headers['set-cookie'][0]).toContain('HttpOnly')
  expect(registered.headers['set-cookie'][0]).toContain('SameSite=Lax')
  expect(registered.headers['access-control-allow-origin']).toBeUndefined()
  const first = registered.headers['set-cookie'][0].split(';')[0]
  const login = await post('/api/auth/login', { account: 'SINGLE_HTTP', password: 'Aa1!"<> &+/%' })
  const second = login.headers['set-cookie'][0].split(';')[0]
  expect(second).not.toBe(first)
  expect(
    JSON.parse(
      (await get('/api/progress', { Cookie: second, 'X-Echo-User': login.data.user.id })).text,
    ),
  ).toEqual({ data: progress, revision: 1 })
  expect((await get('/api/progress', { Cookie: first })).status).toBe(401)
  expect((await get('/api/progress')).status).toBe(401)
  expect(
    (
      await post(
        '/api/progress',
        { data: progress, revision: 1 },
        { Cookie: second, 'X-Echo-User': login.data.user.id },
      )
    ).data.revision,
  ).toBe(2)
  expect((await get('/api/auth/session', { Cookie: first })).status).toBe(401)
  expect(JSON.parse((await get('/api/auth/session', { Cookie: second })).text).user).toEqual(
    login.data.user,
  )
  expect((await post('/api/farm/score', {})).status).toBe(401)
  expect((await post('/api/farm/score', {}, { Cookie: first })).status).toBe(401)
  expect(
    (await post('/api/auth/logout', {}, { Cookie: second, 'X-Echo-User': 'someone_else' })).status,
  ).toBe(401)
  expect(
    (await post('/api/auth/logout', {}, { Cookie: second, 'X-Echo-User': login.data.user.id }))
      .status,
  ).toBe(200)
  expect((await get('/api/auth/session', { Cookie: second })).status).toBe(401)
  expect(
    (
      await post(
        '/api/auth/login',
        { account: 'single_http', password: 'Aa1!"<> &+/%' },
        { 'X-Echo-Request': '0' },
      )
    ).status,
  ).toBe(403)
})

it.each([
  '/api/score',
  '/api/leaderboard',
  '/api/melody/score',
  '/api/melody/leaderboard',
  '/api/island/score',
  '/api/island/leaderboard',
  '/api/wave/score',
  '/api/wave/leaderboard',
  '/api/bounce/score',
  '/api/bounce/leaderboard',
])('removes retired API %s', async (path) => {
  const result = await get(path)
  expect(result.status).toBe(404)
  expect(JSON.parse(result.text).error).toBe('API not found')
  const posted = await new Promise((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port, path, method: 'POST', agent: false },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
      },
    )
    req.on('error', reject)
    req.end('{}')
  })
  expect(posted).toBe(404)
})
