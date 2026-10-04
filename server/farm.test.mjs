import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { createMelodyStore } from './melody.mjs'
import { farmKey, handleFarmRequest, MAX_FARM_BODY_BYTES, MAX_FARM_FRAMES, verifyFarm } from './farm.mjs'
import { FPS, RECIPES, chooseTalent, clampPoint, createFarm, replayFarm, stepFarm } from '../src/features/farm/rules.mjs'

const day = '2026-10-04'
// The fixture farmer keeps its distance from the closest monster instead of
// walking into the horde: healing drops are limited now, so a passive route
// would die long before the long-run behaviour under test.
const flee = (state, target) => {
  let closest = null, nearest = Infinity
  const consider = (x, y, bias) => {
    const dist = Math.hypot((x - state.position[0]) * .84, y - state.position[1]) + bias
    if (dist < nearest) { nearest = dist; closest = { x, y } }
  }
  for (const crop of state.crops) if (crop.hp > 0) consider(crop.x, crop.y, 0)
  for (const shot of state.shots) consider(shot.x, shot.y, -8)
  if (!closest || nearest >= 26) return target
  return [state.position[0] + (state.position[0] - closest.x) * 2, state.position[1] + (state.position[1] - closest.y) * 2]
}
// It also plays one focused build: late runs now meet a second boss, and a
// scattered build would not survive long enough to exercise the big payload.
const FOCUS = 'echo'
function playFixture(active = true) {
  let state = createFarm(day)
  const frames = [], choices = [], surges = []
  const recipe = RECIPES.find((item) => item.weapon === FOCUS)
  for (let tick = 0; tick < FPS * 60 * 10 && state.hp > 0; tick++) {
    while (state.offered.length) {
      const id = state.offered.includes(FOCUS) && state.gear[FOCUS] < 3 ? FOCUS
        : state.offered.includes(recipe.chip) && state.gear[recipe.chip] < 3 ? recipe.chip : state.offered[0]
      choices.push({ tick, id }); state = chooseTalent(state, id)
    }
    const point = clampPoint(state.position, active ? flee(state, [50 + 32 * Math.sin(tick / 45), 50 + 30 * Math.cos(tick / 61)]) : state.position)
    const surge = active && state.charge === 100
    if (surge) surges.push(tick)
    frames.push(point)
    state = stepFarm(state, point, surge).state
  }
  return replayFarm(day, frames, choices, surges)
}
const round = playFixture()
const lowerRound = playFixture(false)
const input = { ...round, name: '丰收小兔', playerId: 'farm_test_player' }

function createRequest(store) {
  return async (method, path, body) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]); req.method = method
    const result = { status: 0, data: null, headers: null }
    const res = { headersSent: false, writeHead(status, headers) { result.status = status; result.headers = headers; this.headersSent = true }, end(value) { result.data = JSON.parse(value) } }
    await handleFarmRequest(req, res, new URL(path, 'http://localhost'), store)
    return result
  }
}

describe('replay-verified daily farm leaderboard', () => {
  it('derives the ranking from a completed endless run, ignoring client-provided rewards', () => {
    expect(round.frames.length).toBeGreaterThan(FPS * 60)
    expect(round.outcome).toBe('defeated')
    expect(round.score).toBeGreaterThan(0)
    expect(verifyFarm({ ...input, maxCombo: 999999, bosses: 999999, stars: 999, harvested: 999999, gear: { drum: 99 } })).toEqual({
      playerId: input.playerId, name: input.name, songId: farmKey(day), difficulty: 'farm', score: round.score,
      accuracy: Math.min(10000, round.bosses * 1000 + round.harvested), maxCombo: round.maxCombo, stars: round.stars, seconds: Math.round(round.seconds),
    })
    expect(Math.round(round.seconds)).toBeGreaterThan(60)
  })

  it('accepts a replay-verified defeat, but rejects truncation and frames after death', () => {
    expect(lowerRound.outcome).toBe('defeated')
    expect(lowerRound.frames.length).toBeLessThan(FPS * 60)
    const defeat = { ...lowerRound, name: input.name, playerId: input.playerId }
    expect(verifyFarm(defeat)?.score).toBe(lowerRound.score)
    expect(verifyFarm({ ...defeat, frames: lowerRound.frames.slice(0, -1) })).toBeNull()
    expect(verifyFarm({ ...defeat, frames: [...lowerRound.frames, lowerRound.frames.at(-1)] })).toBeNull()
    expect(verifyFarm({ ...defeat, surges: [lowerRound.frames.length] })).toBeNull()
    expect(farmKey(day)).toBe(`farm:v4:endless:${day}`)
  })

  it('rejects the former one-minute finish while the player is alive', () => {
    const frames = round.frames.slice(0, FPS * 60)
    const choices = round.choices.filter((choice) => choice.tick < frames.length)
    const surges = round.surges.filter((tick) => tick < frames.length)
    expect(replayFarm(day, frames, choices, surges)).toBeNull()
    expect(verifyFarm({ ...input, frames, choices, surges })).toBeNull()
  })

  it('refuses absurdly long replays so one upload cannot stall the server', () => {
    expect(input.frames.length).toBeLessThan(MAX_FARM_FRAMES)
    expect(verifyFarm({ ...input, frames: [] })).toBeNull()
    expect(verifyFarm({ ...input, frames: [...input.frames, ...Array.from({ length: MAX_FARM_FRAMES }, () => input.frames[0])] })).toBeNull()
  })
  it('rejects forged points, shortcuts, impossible upgrades and uncharged surges', () => {
    const badFrames = round.frames.map((point) => [...point]); badFrames[0] = [97, 4]
    for (const bad of [null, { ...input, score: input.score + 1 }, { ...input, score: String(input.score) }, { ...input, frames: input.frames.slice(1) },
      { ...input, frames: badFrames }, { ...input, choices: [] }, { ...input, choices: [{ tick: 0, id: 'lucky' }, ...input.choices] },
      { ...input, surges: [0] }, { ...input, name: '   ' }, { ...input, playerId: '../bad' }, { ...input, day: '2026-02-30' },
    ]) expect(verifyFarm(bad)).toBeNull()
  })

  it('submits, ranks two farmers, preserves each best score and isolates dates and games', async () => {
    const store = createMelodyStore(':memory:')
    const request = createRequest(store)
    try {
      const accepted = await request('POST', '/api/farm/score', JSON.stringify(input))
      expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(32768)
      expect(accepted.status).toBe(200)
      expect(accepted.headers['Cache-Control']).toBe('no-store')
      expect(accepted.data).toMatchObject({ acceptedScore: round.score, total: 1, own: { score: round.score, rank: 1 } })
      expect(lowerRound.score).toBeLessThan(round.score)
      const second = await request('POST', '/api/farm/score', JSON.stringify({ ...lowerRound, playerId: 'farm_second_player', name: '胡萝卜队长' }))
      expect(second.data.own).toMatchObject({ rank: 2, score: lowerRound.score, isYou: true })
      const retry = await request('POST', '/api/farm/score', JSON.stringify({ ...lowerRound, playerId: input.playerId, name: '丰收小兔' }))
      expect(retry.data.own.score).toBe(round.score)
      expect(retry.data.total).toBe(2)
      const board = await request('GET', `/api/farm/leaderboard?day=${day}&playerId=${input.playerId}`)
      expect(board.data.data.map((entry) => entry.score)).toEqual([round.score, lowerRound.score])
      expect(board.data.own.rank).toBe(1)
      expect((await request('GET', '/api/farm/leaderboard?day=2026-10-05')).data.total).toBe(0)
      expect(store.board(`wave:v1:${day}`, 'wave').total).toBe(0)
      expect(store.board(`farm:v3:${day}`, 'farm').total).toBe(0)
      expect(store.board(`island:v1:${day}`, 'island').total).toBe(0)
    } finally { store.close() }
  })

  it('returns useful HTTP errors for malformed, oversized, invalid and unknown requests', async () => {
    const store = createMelodyStore(':memory:')
    const request = createRequest(store)
    try {
      expect((await request('GET', '/api/farm/leaderboard?day=2026-02-30')).status).toBe(400)
      expect((await request('GET', '/api/farm/leaderboard')).status).toBe(400)
      expect((await request('POST', '/api/farm/score', '{')).status).toBe(400)
      expect((await request('POST', '/api/farm/score', 'a'.repeat(MAX_FARM_BODY_BYTES + 1))).status).toBe(413)
      expect((await request('POST', '/api/farm/score', JSON.stringify({ ...input, score: 999999 }))).status).toBe(400)
      expect((await request('GET', '/api/farm/no-such-route')).status).toBe(404)
      expect((await request('POST', '/api/farm/leaderboard', '{}')).status).toBe(404)
    } finally { store.close() }
  })
})
