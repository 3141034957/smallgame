import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { DEFAULT_AIM, replayRound } from '../src/features/bounce/rules.mjs'
import { bounceKey, handleBounceRequest, verifyBounce } from './bounce.mjs'
import { createMelodyStore } from './melody.mjs'

const round = replayRound('2026-10-04', [DEFAULT_AIM, { angle: -25, power: 95 }, { angle: 25, power: 95 }])
const input = { day: round.day, shots: round.shots, score: round.score, playerId: 'bounce_test_player', name: '弹弹小兔' }
describe('verified bounce leaderboard', () => {
  it('recalculates all three trajectories, chain bonuses and score instead of trusting the client', () => {
    expect(verifyBounce(input)).toMatchObject({ score: 7330, maxCombo: 19, difficulty: 'bounce', songId: 'bounce:v1:2026-10-04' })
    expect(verifyBounce({ ...input, score: input.score + 1 })).toBeNull()
    expect(verifyBounce({ ...input, shots: input.shots.slice(1) })).toBeNull()
    expect(verifyBounce({ ...input, shots: input.shots.map(() => ({ angle: 0, power: 1000 })) })).toBeNull()
    expect(verifyBounce({ ...input, day: '2026-02-30' })).toBeNull()
    expect(verifyBounce({ ...input, playerId: '../invalid' })).toBeNull()
    expect(verifyBounce({ ...input, name: ' ' })).toBeNull()
    expect(verifyBounce(null)).toBeNull()
  })
  it('keeps each player’s best round, separates dates and other games, and returns personal rank', () => {
    const store = createMelodyStore(':memory:')
    try {
      const record = verifyBounce(input)
      store.submit(record, 100)
      store.submit({ ...record, score: record.score - 1, name: '新昵称' }, 200)
      expect(store.board(bounceKey(input.day), 'bounce', input.playerId).own).toMatchObject({ rank: 1, score: round.score, name: '新昵称', isYou: true })
      expect(store.board(bounceKey('2026-10-05'), 'bounce').total).toBe(0)
      expect(store.board('island:2026-10-04:picnic', 'explore').total).toBe(0)
      expect(store.board('strawberry', 'cozy').total).toBe(0)
    } finally { store.close() }
  })
  it('handles the real score/board API, malformed bodies and invalid replay inputs', async () => {
    const store = createMelodyStore(':memory:')
    const request = async (method, path, body) => {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]); req.method = method
      const result = { status: 0, data: null }
      const res = { headersSent: false, writeHead(status) { result.status = status; this.headersSent = true }, end(body) { result.data = JSON.parse(body) } }
      await handleBounceRequest(req, res, new URL(path, 'http://localhost'), store)
      return result
    }
    try {
      const submission = await request('POST', '/api/bounce/score', JSON.stringify(input))
      expect(submission.status).toBe(200)
      expect(submission.data.own.score).toBe(round.score)
      expect((await request('GET', '/api/bounce/leaderboard?day=2026-10-04&playerId=bounce_test_player')).data.own.rank).toBe(1)
      expect((await request('POST', '/api/bounce/score', '{')).status).toBe(400)
      expect((await request('POST', '/api/bounce/score', 'a'.repeat(2049))).status).toBe(413)
      expect((await request('POST', '/api/bounce/score', JSON.stringify({ ...input, score: 999999 }))).status).toBe(400)
      expect((await request('GET', '/api/bounce/leaderboard?day=2026-02-30')).status).toBe(400)
    } finally { store.close() }
  })
})

it('verifies new performances on a separate board and rejects forged roles or mode changes', async () => {
  const { replayTour } = await import('../src/features/bounce/tour.mjs')
  const tour = replayTour(input.day, ['rabbit', 'cat', 'bird'].map((character) => ({ angle: 20, power: 95, character })))
  const submission = { ...input, mode: 'tour', shots: tour.shots, score: tour.score }
  const record = verifyBounce(submission)
  expect(record.songId).toBe(bounceKey(input.day, 'tour'))
  expect(verifyBounce({ ...submission, score: tour.score + 1 })).toBeNull()
  expect(verifyBounce({ ...submission, mode: 'unlimited' })).toBeNull()
  expect(verifyBounce({ ...submission, shots: tour.shots.map((shot) => ({ ...shot, character: 'fake' })) })).toBeNull()
  const store = createMelodyStore(':memory:')
  try {
    store.submit(record)
    expect(store.board(bounceKey(input.day), 'bounce').total).toBe(0)
    expect(store.board(bounceKey(input.day, 'tour'), 'bounce').total).toBe(1)
  } finally { store.close() }
})
