import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { act, createJourney } from '../src/features/island/rules.mjs'
import { handleIslandRequest, verifyJourney } from './island.mjs'
import { createMelodyStore } from './melody.mjs'

function journey() {
  let state = createJourney('picnic', '2026-10-03')
  for (const cell of [7, 2, 1, 0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 22, 17, 12]) {
    state = act(state, { type: 'move', cell })
    if ([0, 4, 22].includes(cell)) state = act(state, { type: 'invite' })
  }
  for (const id of ['rest', 'bloom', 'wind']) state = act(state, { type: 'spell', id })
  state = act(state, { type: 'finish' })
  return state
}
const input = (state) => ({ islandId: state.islandId, day: state.day, actions: state.actions, score: state.score, name: '小岛旅行家', playerId: 'island_test_player' })

describe('verified island rankings', () => {
  it('recomputes a complete journey with spells, score, exploration and stars', () => {
    const state = journey()
    expect(state.score).toBe(1920)
    const record = verifyJourney(input(state))
    expect(record).toMatchObject({ score: 1920, stars: 3, maxCombo: 3, accuracy: 5714, songId: 'island:2026-10-03:picnic', difficulty: 'explore' })
  })
  it('rejects invented totals, teleports, duplicate spells and unfinished routes', () => {
    const state = journey()
    expect(verifyJourney({ ...input(state), score: state.score + 1 })).toBeNull()
    expect(verifyJourney({ ...input(state), actions: [{ type: 'move', cell: 0 }, { type: 'finish' }] })).toBeNull()
    expect(verifyJourney({ ...input(state), actions: state.actions.slice(0, -1) })).toBeNull()
    const actions = [...state.actions]; actions.splice(actions.length - 1, 0, { type: 'spell', id: 'rest' })
    expect(verifyJourney({ ...input(state), actions })).toBeNull()
    expect(verifyJourney({ ...input(state), day: '2026-02-30' })).toBeNull()
    expect(verifyJourney(null)).toBeNull()
  })
  it('separates dates, islands and rhythm scores in persistent ranking storage', () => {
    const db = createMelodyStore(':memory:')
    try {
      const record = verifyJourney(input(journey()))
      db.submit(record)
      expect(db.board('island:2026-10-03:picnic', 'explore', record.playerId).own.rank).toBe(1)
      expect(db.board('island:2026-10-04:picnic', 'explore').total).toBe(0)
      expect(db.board('island:2026-10-03:cloud', 'explore').total).toBe(0)
      expect(db.board('strawberry', 'cozy').total).toBe(0)
    } finally { db.close() }
  })
  it('submits and retrieves verified journeys through the API and rejects invalid JSON', async () => {
    const db = createMelodyStore(':memory:')
    const request = async (method, path, body) => {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(body)])
      req.method = method
      const output = { status: 0, data: null }
      const res = { headersSent: false, writeHead(status) { output.status = status; this.headersSent = true }, end(body) { output.data = JSON.parse(body) } }
      await handleIslandRequest(req, res, new URL(path, 'http://localhost'), db)
      return output
    }
    try {
      const submission = await request('POST', '/api/island/score', JSON.stringify(input(journey())))
      expect(submission.status).toBe(200)
      expect(submission.data.own.score).toBe(1920)
      const board = await request('GET', '/api/island/leaderboard?island=picnic&day=2026-10-03&playerId=island_test_player')
      expect(board.data.own.rank).toBe(1)
      expect((await request('POST', '/api/island/score', '{')).status).toBe(400)
      expect((await request('POST', '/api/island/score', 'a'.repeat(16385))).status).toBe(413)
      expect((await request('GET', '/api/island/leaderboard?island=invalid&day=2026-10-03')).status).toBe(400)
    } finally { db.close() }
  })
})
