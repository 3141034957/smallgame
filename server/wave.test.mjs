import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { createMelodyStore } from './melody.mjs'
import { handleWaveRequest, verifyWave, waveKey } from './wave.mjs'
import { createWave, findMove, playWave, replayWave } from '../src/features/wave/rules.mjs'
const day = '2026-10-04'
let state = createWave(day)
const actions = [{ t: 0, path: [30, 31, 32, 33, 34, 35] }]
state = playWave(state, actions[0]).state
actions.push({ t: 1000, path: [35] })
state = playWave(state, actions[1]).state
actions.push({ t: 2000, path: findMove(state.board) })
const round = replayWave(day, actions)
const input = { ...round, name: '音浪试玩', playerId: 'wave_test_player' }
describe('verified musical-chain leaderboard', () => {
  it('replays the current board and rejects impossible chains and forged totals', () => {
    expect(verifyWave(input)).toMatchObject({
      score: round.score,
      songId: waveKey(day),
      difficulty: 'wave',
    })
    for (const bad of [
      null,
      { ...input, score: input.score + 1 },
      { ...input, actions: [{ t: 0, path: [0, 0, 0] }] },
      { ...input, actions: [{ t: 0, boost: true }] },
      { ...input, actions: [{ t: 45000, path: [30, 31, 32] }] },
      { ...input, name: ' ' },
      { ...input, playerId: '../bad' },
    ])
      expect(verifyWave(bad)).toBeNull()
  })
  it('accepts valid HTTP submissions, separates older boards, and handles invalid requests', async () => {
    const store = createMelodyStore(':memory:')
    const request = async (method, path, body) => {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(body)])
      req.method = method
      const result = { status: 0, data: null }
      const res = {
        headersSent: false,
        writeHead(status) {
          result.status = status
          this.headersSent = true
        },
        end(value) {
          result.data = JSON.parse(value)
        },
      }
      await handleWaveRequest(req, res, new URL(path, 'http://localhost'), store)
      return result
    }
    try {
      const result = await request('POST', '/api/wave/score', JSON.stringify(input))
      expect(result.status).toBe(200)
      expect(result.data.own.score).toBe(round.score)
      expect(
        (await request('GET', `/api/wave/leaderboard?day=${day}&playerId=wave_test_player`)).data
          .own.rank,
      ).toBe(1)
      expect(store.board('bounce:v2:tour:2026-10-04', 'bounce').total).toBe(0)
      expect((await request('GET', '/api/wave/leaderboard?day=2026-02-30')).status).toBe(400)
      expect((await request('POST', '/api/wave/score', '{')).status).toBe(400)
      expect((await request('POST', '/api/wave/score', 'a'.repeat(65537))).status).toBe(413)
      expect(
        (await request('POST', '/api/wave/score', JSON.stringify({ ...input, score: 999999 })))
          .status,
      ).toBe(400)
    } finally {
      store.close()
    }
  })
})
