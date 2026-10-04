import { afterEach, describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { createMelodyStore, handleMelodyRequest, verifyPerformance } from './melody.mjs'
import { SONGS, DIFFICULTIES, makeChart, emptyRun, hitNote, advanceRun, runAccuracy } from '../src/features/melody/rules.mjs'

const stores = []
afterEach(() => { for (const store of stores.splice(0)) store.close() })
function store() { const value = createMelodyStore(':memory:'); stores.push(value); return value }
function performance(song = SONGS[0], difficulty = 'cozy', taps = makeChart(song, difficulty).map(({ lane, time }) => ({ lane, time }))) {
  const notes = makeChart(song, difficulty)
  let run = emptyRun()
  for (const tap of taps) run = hitNote(run, notes, tap.lane, tap.time).run
  run = advanceRun(run, notes, song.beats * 60 / song.bpm + 1)
  return { input: { playerId: 'player_one_123', name: '奶糖', songId: song.id, difficulty, score: run.score, taps }, run }
}

describe('melody performance verification', () => {
  it('replays exactly the same judgement as the browser for all nine boards', () => {
    for (const song of SONGS) for (const { id } of DIFFICULTIES) {
      const { input, run } = performance(song, id)
      const record = verifyPerformance(input)
      expect(record?.score).toBe(run.score)
      expect(record?.maxCombo).toBe(makeChart(song, id).length)
      expect(record?.accuracy).toBe(10000)
      expect(record?.stars).toBe(3)
    }
  })
  it('preserves good hits, misses and spam penalties, including calibrated timing', () => {
    const notes = makeChart(SONGS[0], 'cozy')
    const taps = notes.slice(1).map((note, index) => ({ lane: note.lane, time: note.time + (index % 2 ? 0.12 : -0.04) }))
    taps.splice(5, 0, { lane: (taps[4].lane + 1) % 4, time: taps[4].time + 0.001 })
    const { input, run } = performance(SONGS[0], 'cozy', taps)
    const record = verifyPerformance(input)
    expect(run.misses).toBe(1)
    expect(run.ghosts).toBeGreaterThan(0)
    expect(record?.score).toBe(run.score)
    expect(record?.accuracy).toBe(Math.round(runAccuracy(run, notes.length) * 10000))
  })
  it('rejects fabricated totals, unknown modes, malformed events and out-of-order timing', () => {
    const { input } = performance()
    expect(verifyPerformance({ ...input, score: 999999 })).toBeNull()
    expect(verifyPerformance({ ...input, songId: 'unknown' })).toBeNull()
    expect(verifyPerformance({ ...input, difficulty: 'practice' })).toBeNull()
    expect(verifyPerformance({ ...input, taps: [{ lane: 9, time: 3 }] })).toBeNull()
    expect(verifyPerformance({ ...input, taps: [{ lane: 0, time: Infinity }] })).toBeNull()
    expect(verifyPerformance({ ...input, taps: [...input.taps].reverse() })).toBeNull()
    expect(verifyPerformance({ ...input, taps: Array(1001).fill(input.taps[0]) })).toBeNull()
    expect(verifyPerformance(null)).toBeNull()
  })
})

async function request(db, method, path, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  req.method = method
  const response = { status: 0, headers: {}, body: null, headersSent: false }
  const res = {
    get headersSent() { return response.headersSent },
    writeHead(status, headers) { response.status = status; response.headers = headers; response.headersSent = true },
    end(value) { response.body = JSON.parse(value) },
  }
  await handleMelodyRequest(req, res, new URL(path, 'http://localhost'), db)
  return response
}

describe('melody API', () => {
  it('submits a verified performance and retrieves the matching board', async () => {
    const db = store()
    const { input } = performance()
    const submission = await request(db, 'POST', '/api/melody/score', JSON.stringify(input))
    expect(submission.status).toBe(200)
    expect(submission.body.acceptedScore).toBe(input.score)
    expect(submission.body.own.rank).toBe(1)
    const board = await request(db, 'GET', `/api/melody/leaderboard?song=strawberry&difficulty=cozy&playerId=${input.playerId}`)
    expect(board.status).toBe(200)
    expect(board.headers['Cache-Control']).toBe('no-store')
    expect(board.body.data).toEqual(submission.body.data)
  })
  it('returns JSON errors for invalid requests without changing the board', async () => {
    const db = store()
    expect((await request(db, 'POST', '/api/melody/score', 'invalid json')).status).toBe(400)
    expect((await request(db, 'POST', '/api/melody/score', 'a'.repeat(65537))).status).toBe(413)
    expect((await request(db, 'GET', '/api/melody/leaderboard?song=no&difficulty=cozy')).status).toBe(400)
    const { input } = performance()
    expect((await request(db, 'POST', '/api/melody/score', JSON.stringify({ ...input, score: input.score + 1 }))).status).toBe(400)
    expect(db.board('strawberry', 'cozy').total).toBe(0)
  })
})

describe('separate online melody leaderboards', () => {
  it('keeps one best per player per board and supports duplicate nicknames', () => {
    const db = store()
    const record = verifyPerformance(performance().input)
    db.submit(record, 1)
    db.submit({ ...record, score: record.score - 100, name: '新昵称' }, 2)
    db.submit({ ...record, playerId: 'player_two_123', name: '新昵称' }, 3)
    const board = db.board('strawberry', 'cozy', record.playerId)
    expect(board.total).toBe(2)
    expect(board.own.rank).toBe(1)
    expect(board.own.score).toBe(record.score)
    expect(board.own.name).toBe('新昵称')
    expect(board.data[1].name).toBe('新昵称')
    expect(board.data[1].isYou).toBe(false)
    expect(db.board('cloud', 'cozy').total).toBe(0)
    expect(db.board('strawberry', 'party').total).toBe(0)
    expect(board.data[0]).not.toHaveProperty('player_id')
  })
  it('uses accuracy, combo and first achieved time for score ties', () => {
    const db = store()
    const record = verifyPerformance(performance().input)
    db.submit({ ...record, playerId: 'player_low_accuracy', accuracy: 8000 }, 1)
    db.submit({ ...record, playerId: 'player_low_combo', maxCombo: 1 }, 2)
    db.submit({ ...record, playerId: 'player_perfect' }, 3)
    db.submit({ ...record, playerId: 'player_later' }, 4)
    expect(db.board('strawberry', 'cozy').data.map(({ rank, name }) => ({ rank, name })).length).toBe(4)
    expect(db.board('strawberry', 'cozy', 'player_perfect').own.rank).toBe(1)
    expect(db.board('strawberry', 'cozy', 'player_later').own.rank).toBe(2)
    expect(db.board('strawberry', 'cozy', 'player_low_combo').own.rank).toBe(3)
    expect(db.board('strawberry', 'cozy', 'player_low_accuracy').own.rank).toBe(4)
  })
  it('returns the personal rank even outside the first fifty', () => {
    const db = store()
    const record = verifyPerformance(performance().input)
    for (let index = 0; index < 60; index++) db.submit({ ...record, playerId: `player_${index.toString().padStart(4, '0')}` }, index)
    const board = db.board('strawberry', 'cozy', 'player_0059')
    expect(board.data).toHaveLength(50)
    expect(board.total).toBe(60)
    expect(board.own.rank).toBe(60)
  })
})
