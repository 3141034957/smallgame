import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { createFarmStore } from './farm-store.mjs'
import { AuthError } from './auth-store.mjs'
import {
  FARM_PREFIX,
  FARM_SCORE_LIMIT,
  farmKey,
  handleFarmRequest,
  MAX_FARM_BODY_BYTES,
  MAX_FARM_FRAMES,
  verifyFarm,
} from './farm.mjs'
import {
  FPS,
  MAX_GEAR_LEVEL,
  RECIPES,
  clampPoint,
  createFarm,
  farmMoveStep,
  replayFarm,
  stepFarm,
} from '../src/features/farm/rules.mjs'
import { normalizePermanentLevels, permanentLevelCount } from '../src/features/farm/permanent.mjs'
import { FARM_RULESET } from '../src/features/farm/monsters.mjs'
import { selectFarmUpgrade } from '../src/features/farm/upgradeSelection.ts'
import { DEFAULT_CHARACTER_ID } from './identity.mjs'

const day = '2026-10-04'
// The fixture farmer keeps its distance from the closest monster instead of
// walking into the horde: healing drops are limited now, so a passive route
// would die long before the long-run behaviour under test.
const flee = (state, target) => {
  let closest = null,
    nearest = Infinity
  const consider = (x, y, bias) => {
    const dist = Math.hypot((x - state.position[0]) * 0.84, y - state.position[1]) + bias
    if (dist < nearest) {
      nearest = dist
      closest = { x, y }
    }
  }
  for (const crop of state.crops) if (crop.hp > 0) consider(crop.x, crop.y, 0)
  for (const shot of state.shots) consider(shot.x, shot.y, -8)
  if (!closest || nearest >= 26) return target
  return [
    state.position[0] + (state.position[0] - closest.x) * 2,
    state.position[1] + (state.position[1] - closest.y) * 2,
  ]
}
// It also plays one focused build: late runs now meet a second boss, and a
// scattered build would not survive long enough to exercise the big payload.
const FOCUS = 'echo'
function playFixture(
  active = true,
  permanent = {},
  // Five minutes of dodging, then the closing walk: a longer opening leaves
  // the run alive past the frame budget, and a live run cannot be ranked.
  movingSeconds = 300,
  characterId = DEFAULT_CHARACTER_ID,
) {
  let state = createFarm(day, permanent, characterId)
  const frames = [],
    choices = [],
    surges = []
  const recipe = RECIPES.find((item) => item.weapon === FOCUS)
  for (let tick = 0; tick < FPS * movingSeconds && state.hp > 0; tick++) {
    while (state.offered.length) {
      const id =
        state.offered.includes(FOCUS) && state.gear[FOCUS] < MAX_GEAR_LEVEL
          ? FOCUS
          : state.offered.includes(recipe.chip) && state.gear[recipe.chip] < MAX_GEAR_LEVEL
            ? recipe.chip
            : state.offered[0]
      const selected = selectFarmUpgrade(state, id)
      choices.push(...selected.choices)
      state = selected.state
    }
    const point = clampPoint(
      state.position,
      active
        ? flee(state, [50 + 32 * Math.sin(tick / 45), 50 + 30 * Math.cos(tick / 61)])
        : state.position,
      farmMoveStep(state),
    )
    const surge = active && state.charge === 100
    if (surge) surges.push(tick)
    frames.push(point)
    state = stepFarm(state, point, surge).state
  }
  // Reserve a minute before the upload limit for ending the long-run fixture.
  // Walk into the horde until it ends: contact damage outpaces capped healing,
  // so this finishes on every platform instead of depending on float details.
  while (state.hp > 0 && frames.length < FPS * 60 * 12) {
    while (state.offered.length) {
      const id = state.offered[0]
      const selected = selectFarmUpgrade(state, id)
      choices.push(...selected.choices)
      state = selected.state
    }
    const target = state.crops.find((crop) => crop.hp > 0)
    const point = clampPoint(
      state.position,
      target ? [target.x, target.y] : [...state.position],
      farmMoveStep(state),
    )
    frames.push(point)
    state = stepFarm(state, point, false).state
  }
  return replayFarm(day, frames, choices, surges, permanent, characterId)
}
const round = playFixture()
const lowerRound = playFixture(false)
const input = {
  ...round,
  name: '丰收小兔',
  playerId: 'farm_test_player',
  characterId: DEFAULT_CHARACTER_ID,
}
// Short runs for the member tests: the character is fixed for a whole run, so
// two of them are enough to show the replay follows the chosen member.
// Sixty seconds of dodging: with the chase that ends the run, the recording
// has to stay inside MAX_FARM_FRAMES, or the upload is rejected on length.
const drumRound = playFixture(true, {}, 60, 'bear-drums')
const guitarRound = playFixture(true, {}, 60, 'cat-guitar')
// The same fixture without a member: this is what an older client, whose run
// opened with the random starter deal, uploads.
const legacyRound = playFixture(false, {}, undefined, null)

function createRequest(store, consumeAttempt) {
  return async (method, path, body) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(body)])
    req.method = method
    const result = { status: 0, data: null, headers: null }
    const res = {
      headersSent: false,
      writeHead(status, headers) {
        result.status = status
        result.headers = headers
        this.headersSent = true
      },
      end(value) {
        result.data = JSON.parse(value)
      },
    }
    const url = new URL(path, 'http://localhost')
    // Pure route tests inject a trusted principal; real HTTP tests exercise cookies.
    let id = url.searchParams.get('playerId')
    try {
      id = JSON.parse(body)?.playerId ?? id
    } catch {
      /* Malformed body is tested by the route. */
    }
    await handleFarmRequest(
      req,
      res,
      url,
      store,
      () => ({ id: id ?? input.playerId }),
      consumeAttempt,
    )
    return result
  }
}

describe('replay-verified all-time farm leaderboard', () => {
  it('replays purchased attributes from the run snapshot and rejects invalid growth levels', () => {
    // 旧档（某几项满级）折算成链前 N 个节点：提交时必须已经是合法的链前缀。
    const legacy = { vitality: 12, power: 4, stride: 1, armor: 2, regen: 5, shield: 1 }
    const grown = playFixture(true, normalizePermanentLevels(legacy), 90)
    expect(grown).not.toBeNull()
    expect(permanentLevelCount(grown.permanent)).toBe(12)
    expect(grown.permanent['step-12']).toBe(1)
    expect(grown.permanent['step-13']).toBe(0)
    expect(grown.frames.some((point) => point.some((value) => !Number.isInteger(value)))).toBe(true)
    const submission = {
      ...grown,
      name: '成长乐手',
      playerId: 'farm_grown_player',
      characterId: DEFAULT_CHARACTER_ID,
    }
    expect(verifyFarm(submission)?.score).toBe(grown.score)
    // 链上不存在的 id、非 0/1 的等级、以及旧格式的等级全部拒绝。
    expect(verifyFarm({ ...submission, permanent: { vitality: 99 } })).toBeNull()
    expect(verifyFarm({ ...submission, permanent: null })).toBeNull()
    expect(verifyFarm({ ...submission, permanent: { stride: 1.5 } })).toBeNull()
    expect(verifyFarm({ ...submission, permanent: { unknown: 1 } })).toBeNull()
    expect(verifyFarm({ ...submission, permanent: { 'step-1': 2 } })).toBeNull()
    expect(verifyFarm({ ...submission, permanent: { 'step-30': 1 } })).toBeNull()
  })
  it('derives the ranking from a completed endless run, ignoring client-provided rewards', () => {
    expect(round.frames.length).toBeGreaterThan(FPS * 60)
    expect(round.outcome).toBe('defeated')
    expect(round.score).toBeGreaterThan(0)
    expect(
      verifyFarm({
        ...input,
        maxCombo: 999999,
        bosses: 999999,
        stars: 999,
        harvested: 999999,
        gear: { drum: 99 },
      }),
    ).toEqual({
      playerId: input.playerId,
      name: input.name,
      songId: farmKey(day),
      difficulty: 'farm',
      score: round.score,
      accuracy: Math.min(10000, round.bosses * 1000 + round.harvested),
      maxCombo: round.maxCombo,
      stars: round.stars,
      seconds: Math.round(round.seconds),
      characterId: 'bear-drums',
    })
    // The member is part of the run now: it decides the starting instrument, so
    // the same recording only verifies under the member it was played with, and
    // an unusable id falls back to the default member instead of being stored.
    expect(verifyFarm({ ...input, characterId: 'crocodile-beat' })).toBeNull()
    expect(verifyFarm({ ...input, characterId: 'DROP TABLE melody_scores' })).toMatchObject({
      characterId: 'bear-drums',
      score: round.score,
    })
    expect(Math.round(round.seconds)).toBeGreaterThan(60)
  }, 120000)

  it('accepts a replay-verified defeat, but rejects truncation and frames after death', () => {
    expect(lowerRound.outcome).toBe('defeated')
    expect(lowerRound.frames.length).toBeLessThan(FPS * 60)
    const defeat = {
      ...lowerRound,
      name: input.name,
      playerId: input.playerId,
      characterId: DEFAULT_CHARACTER_ID,
    }
    expect(verifyFarm(defeat)?.score).toBe(lowerRound.score)
    expect(verifyFarm({ ...defeat, frames: lowerRound.frames.slice(0, -1) })).toBeNull()
    expect(
      verifyFarm({ ...defeat, frames: [...lowerRound.frames, lowerRound.frames.at(-1)] }),
    ).toBeNull()
    expect(verifyFarm({ ...defeat, surges: [lowerRound.frames.length] })).toBeNull()
    expect(farmKey(day)).toBe(`farm:${FARM_RULESET}:${day}`)
  })

  it('replays each run with the character it was submitted with', () => {
    expect(drumRound).not.toBeNull()
    expect(guitarRound).not.toBeNull()
    const drummer = {
      ...drumRound,
      name: '鼓手咚咚',
      playerId: 'farm_drum_player',
      characterId: 'bear-drums',
    }
    const guitarist = {
      ...guitarRound,
      name: '吉他手弦弦',
      playerId: 'farm_guitar_player',
      characterId: 'cat-guitar',
    }
    // Both members own a verified score: the server rebuilt the same instrument.
    expect(verifyFarm(drummer)).toMatchObject({
      score: drumRound.score,
      characterId: 'bear-drums',
    })
    expect(verifyFarm(guitarist)).toMatchObject({
      score: guitarRound.score,
      characterId: 'cat-guitar',
    })
  }, 120000)

  it('starts each member on its own instrument, so a run replayed as another member no longer verifies', () => {
    const replayAs = (round, characterId) =>
      replayFarm(day, round.frames, round.choices, round.surges, {}, characterId)?.score ?? null
    expect(replayAs(drumRound, 'bear-drums')).toBe(drumRound.score)
    expect(replayAs(guitarRound, 'cat-guitar')).toBe(guitarRound.score)
    // The same recording cannot pass as the other member: the opening instrument
    // differs, so the replay diverges and the score no longer matches.
    expect(replayAs(drumRound, 'cat-guitar')).not.toBe(drumRound.score)
    expect(replayAs(guitarRound, 'bear-drums')).not.toBe(guitarRound.score)
    expect(
      verifyFarm({
        ...drumRound,
        name: input.name,
        playerId: input.playerId,
        characterId: 'cat-guitar',
      })?.score ?? null,
    ).not.toBe(drumRound.score)
    expect(
      verifyFarm({
        ...guitarRound,
        name: input.name,
        playerId: input.playerId,
        characterId: 'bear-drums',
      })?.score ?? null,
    ).not.toBe(guitarRound.score)
  }, 120000)

  it('rejects older uploads: a run without a member can no longer score', async () => {
    expect(legacyRound).not.toBeNull()
    const legacy = { ...legacyRound, name: input.name, playerId: input.playerId }
    // No field at all, an empty string and a null are all "the client did not
    // pick a member", so the run opens with the old random starter deal instead
    // of holding an instrument. Nothing attacks on the band's behalf any more,
    // so that run harvests nothing and its score stays at zero — and a zero is
    // not a leaderboard entry, so every old shape is rejected now.
    expect(legacyRound.score).toBe(0)
    for (const characterId of [undefined, null, ''])
      expect(verifyFarm({ ...legacy, characterId })).toBeNull()
    // Proof that the old path really is a different run: replaying the same
    // recording as a member diverges, because that run opens holding an
    // instrument instead of being dealt three starters.
    const asMember = (characterId) =>
      replayFarm(day, legacyRound.frames, legacyRound.choices, legacyRound.surges, {}, characterId)
        ?.score ?? null
    expect(asMember(null)).toBe(legacyRound.score)
    expect(asMember('bear-drums')).not.toBe(legacyRound.score)
    expect(verifyFarm({ ...legacy, characterId: 'bear-drums' })?.score ?? null).not.toBe(
      legacyRound.score,
    )
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    try {
      // The route agrees: the upload is refused instead of stored.
      const rejected = await request('POST', '/api/farm/score', JSON.stringify(legacy))
      expect(rejected.status).toBe(400)
      expect(rejected.data.acceptedScore).toBeUndefined()
    } finally {
      store.close()
    }
  }, 120000)

  it('falls back to the default member when the submitted character is unusable', async () => {
    const modern = {
      ...lowerRound,
      name: input.name,
      playerId: input.playerId,
      characterId: 'bear-drums',
    }
    // A client that sends the field always sends a real value, so junk means a
    // broken or hostile body: replay it as the default member, never as the old
    // path, and never store the junk.
    for (const characterId of ['bear-drums', 'nope', 'DROP TABLE melody_scores', '   '])
      expect(verifyFarm({ ...modern, characterId })).toMatchObject({
        score: lowerRound.score,
        characterId: DEFAULT_CHARACTER_ID,
      })
    // A retired id still migrates, and migrating means replaying as that member.
    expect(verifyFarm({ ...modern, characterId: 'burger-dog' })?.score ?? null).not.toBe(
      lowerRound.score,
    )
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    try {
      for (const characterId of ['nope', 'DROP TABLE melody_scores']) {
        const junk = await request(
          'POST',
          '/api/farm/score',
          JSON.stringify({ ...modern, characterId }),
        )
        expect(junk.status).toBe(200)
        expect(junk.data.acceptedScore).toBe(lowerRound.score)
      }
    } finally {
      store.close()
    }
  }, 120000)

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
    expect(
      verifyFarm({
        ...input,
        frames: [
          ...input.frames,
          ...Array.from({ length: MAX_FARM_FRAMES }, () => input.frames[0]),
        ],
      }),
    ).toBeNull()
  })
  it('rejects forged points, shortcuts, impossible upgrades and uncharged surges', () => {
    const badFrames = round.frames.map((point) => [...point])
    badFrames[0] = [97, 4]
    for (const bad of [
      null,
      { ...input, score: input.score + 1 },
      { ...input, score: String(input.score) },
      { ...input, frames: input.frames.slice(1) },
      { ...input, frames: badFrames },
      { ...input, choices: [] },
      { ...input, choices: [{ tick: 0, id: 'lucky' }, ...input.choices] },
      { ...input, surges: [0] },
      { ...input, name: '   ' },
      { ...input, playerId: '../bad' },
      { ...input, day: '2026-02-30' },
    ])
      expect(verifyFarm(bad)).toBeNull()
  }, 120000)

  it('maps retired avatars in saved rankings without changing scores', () => {
    const store = createFarmStore(':memory:')
    try {
      const record = verifyFarm(input)
      store.submit({ ...record, characterId: 'burger-dog' })
      const board = store.boardAcrossDays(
        farmKey(day).slice(0, -day.length),
        'farm',
        input.playerId,
      )
      expect(board.own).toMatchObject({
        characterId: 'crocodile-beat',
        score: round.score,
        rank: 1,
      })
      expect(board.data[0].characterId).toBe('crocodile-beat')
    } finally {
      store.close()
    }
  }, 120000)

  it('submits, ranks two farmers, preserves each best score across dates and isolates games', async () => {
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    try {
      const accepted = await request(
        'POST',
        '/api/farm/score',
        JSON.stringify({ ...input, characterId: 'bear-drums' }),
      )
      expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(32768)
      expect(accepted.status).toBe(200)
      expect(accepted.headers['Cache-Control']).toBe('no-store')
      expect(accepted.data).toMatchObject({
        acceptedScore: round.score,
        total: 1,
        own: { score: round.score, rank: 1 },
      })
      expect(lowerRound.score).toBeLessThan(round.score)
      const second = await request(
        'POST',
        '/api/farm/score',
        JSON.stringify({
          ...lowerRound,
          playerId: 'farm_second_player',
          name: '胡萝卜队长',
          characterId: DEFAULT_CHARACTER_ID,
        }),
      )
      expect(second.data.own).toMatchObject({ rank: 2, score: lowerRound.score, isYou: true })
      const retry = await request(
        'POST',
        '/api/farm/score',
        JSON.stringify({
          ...lowerRound,
          playerId: input.playerId,
          name: '丰收小兔',
          characterId: DEFAULT_CHARACTER_ID,
        }),
      )
      expect(retry.data.own.score).toBe(round.score)
      expect(retry.data.total).toBe(2)
      const board = await request('GET', `/api/farm/leaderboard?playerId=${input.playerId}`)
      expect(board.data.data.map((entry) => entry.score)).toEqual([round.score, lowerRound.score])
      // The row avatar comes from the id sent with the run.
      expect(board.data.data[0].characterId).toBe('bear-drums')
      expect(board.data.own.characterId).toBe('bear-drums')
      expect(board.data.own.rank).toBe(1)
      expect((await request('GET', '/api/farm/leaderboard?day=2026-10-05')).data.total).toBe(2)
      expect(store.board(`wave:v1:${day}`, 'wave').total).toBe(0)
      expect(store.board(`farm:v3:${day}`, 'farm').total).toBe(0)
      expect(store.board(`island:v1:${day}`, 'island').total).toBe(0)
    } finally {
      store.close()
    }
  })

  it('includes existing daily records, deduplicates players and returns the all-time best after submission', async () => {
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    const record = verifyFarm(input)
    try {
      store.submit(
        { ...record, songId: farmKey('2026-10-01'), score: round.score + 100, seconds: 200 },
        100,
      )
      store.submit({ ...record, songId: farmKey('2026-10-02'), score: round.score - 1 }, 200)
      store.submit(
        {
          ...record,
          playerId: 'farm_historical_player',
          songId: farmKey('2026-09-30'),
          score: round.score + 200,
        },
        50,
      )
      for (const [songId, difficulty] of [
        [`farm:v8-recovery:${day}`, 'farm'],
        [`farm:v3:${day}`, 'farm'],
        [`farm:v4:endless:${day}`, 'farm'],
        [`wave:v1:${day}`, 'wave'],
        [farmKey(day), 'melody'],
      ]) {
        store.submit({
          ...record,
          playerId: 'other_game_player',
          songId,
          difficulty,
          score: 999999,
        })
      }
      const before = await request('GET', `/api/farm/leaderboard?playerId=${input.playerId}`)
      expect(before.data.total).toBe(2)
      expect(before.data.data.map((entry) => entry.score)).toEqual([
        round.score + 200,
        round.score + 100,
      ])
      expect(before.data.own).toMatchObject({
        rank: 2,
        score: round.score + 100,
        seconds: 200,
        isYou: true,
      })
      const submitted = await request('POST', '/api/farm/score', JSON.stringify(input))
      expect(submitted.data).toMatchObject({
        acceptedScore: round.score,
        total: 2,
        own: { rank: 2, score: round.score + 100, seconds: 200 },
      })
      expect(store.board(farmKey('2026-10-01'), 'farm').total).toBe(1)
      expect(store.board(farmKey(day), 'farm', input.playerId).own.score).toBe(round.score)
    } finally {
      store.close()
    }
  })

  it('breaks cross-day ties consistently and updates the personal best when a later day improves it', async () => {
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    const record = { ...verifyFarm(input), score: 1000, accuracy: 100, maxCombo: 10 }
    try {
      store.submit({ ...record, songId: farmKey('2026-10-01'), seconds: 50 }, 100)
      store.submit({ ...record, songId: farmKey('2026-10-02'), seconds: 60 }, 200)
      let board = (await request('GET', `/api/farm/leaderboard?playerId=${input.playerId}`)).data
      expect(board.own.seconds).toBe(50)
      store.submit(
        { ...record, songId: farmKey('2026-10-03'), accuracy: 101, maxCombo: 1, seconds: 70 },
        300,
      )
      store.submit(
        { ...record, songId: farmKey('2026-10-04'), accuracy: 101, maxCombo: 2, seconds: 80 },
        400,
      )
      board = (await request('GET', `/api/farm/leaderboard?playerId=${input.playerId}`)).data
      expect(board.own).toMatchObject({ seconds: 80, accuracy: 1.01, maxCombo: 2 })
      store.submit({ ...record, songId: farmKey('2026-10-05'), score: 1001, seconds: 90 }, 500)
      board = (await request('GET', `/api/farm/leaderboard?playerId=${input.playerId}`)).data
      expect(board).toMatchObject({ total: 1, own: { score: 1001, seconds: 90, rank: 1 } })
    } finally {
      store.close()
    }
  })

  it('counts unique players and returns personal ranks beyond the first 50', async () => {
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    const record = verifyFarm(input)
    try {
      for (let index = 0; index < 55; index++) {
        const playerId = `farm_rank_${String(index).padStart(3, '0')}`
        store.submit({ ...record, playerId, songId: farmKey('2026-10-01'), score: 1000 }, 100)
        store.submit({ ...record, playerId, songId: farmKey('2026-10-02'), score: 999 }, 200)
      }
      const board = (await request('GET', '/api/farm/leaderboard?playerId=farm_rank_054')).data
      expect(board.total).toBe(55)
      expect(board.data).toHaveLength(50)
      expect(board.data.map((entry) => entry.rank)).toEqual(
        Array.from({ length: 50 }, (_, index) => index + 1),
      )
      expect(board.own).toMatchObject({ rank: 55, score: 1000, isYou: true })
      expect(
        (await request('GET', '/api/farm/leaderboard?playerId=unknown_player')).data.own,
      ).toBeNull()
    } finally {
      store.close()
    }
  })

  it('limits score uploads per account before replaying a single frame', async () => {
    const store = createFarmStore(':memory:')
    const keys = []
    let calls = 0
    const request = createRequest(store, (key, limit) => {
      keys.push(key)
      expect(limit).toBe(FARM_SCORE_LIMIT)
      // The real store counts attempts in a 15 minute window; throw like it does.
      if (++calls > 2) throw new AuthError(429, '尝试次数过多，请 15 分钟后重试。')
    })
    try {
      // 409 means the request passed the limiter and reached the ruleset check.
      expect((await request('POST', '/api/farm/score', '{}')).status).toBe(409)
      expect((await request('POST', '/api/farm/score', '{}')).status).toBe(409)
      const blocked = await request('POST', '/api/farm/score', JSON.stringify(input))
      expect(blocked.status).toBe(429)
      expect(blocked.headers['Retry-After']).toBe('900')
      expect(keys).toEqual(Array(3).fill(`score:${input.playerId}`))
      expect(store.boardAcrossDays(FARM_PREFIX, 'farm').total).toBe(0)
    } finally {
      store.close()
    }
  })

  it('refuses non-POST score uploads with 405 and an Allow header', async () => {
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    try {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const rejected = await request(method, '/api/farm/score')
        expect(rejected.status).toBe(405)
        expect(rejected.headers.Allow).toBe('POST')
      }
      // The neighbouring leaderboard route keeps its own contract.
      expect((await request('POST', '/api/farm/leaderboard', '{}')).status).toBe(404)
    } finally {
      store.close()
    }
  })

  it('explains that a run longer than the replayable limit cannot be ranked', async () => {
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    try {
      const long = await request(
        'POST',
        '/api/farm/score',
        JSON.stringify({
          ...input,
          frames: Array.from({ length: MAX_FARM_FRAMES + 1 }, () => input.frames[0]),
        }),
      )
      expect(long.status).toBe(400)
      expect(long.data.error).toContain('上限')
      expect(store.boardAcrossDays(FARM_PREFIX, 'farm').total).toBe(0)
    } finally {
      store.close()
    }
  })

  it('returns useful HTTP errors for malformed, oversized, invalid and unknown requests', async () => {
    const store = createFarmStore(':memory:')
    const request = createRequest(store)
    try {
      expect((await request('GET', '/api/farm/leaderboard?day=2026-02-30')).status).toBe(200)
      expect((await request('GET', '/api/farm/leaderboard')).data).toEqual({
        data: [],
        own: null,
        total: 0,
      })
      expect((await request('POST', '/api/farm/score', '{')).status).toBe(400)
      expect(
        (await request('POST', '/api/farm/score', 'a'.repeat(MAX_FARM_BODY_BYTES + 1))).status,
      ).toBe(413)
      expect(
        (await request('POST', '/api/farm/score', JSON.stringify({ ...input, score: 999999 })))
          .status,
      ).toBe(400)
      for (const ruleset of ['v4-endless', 'v8-recovery']) {
        const outdated = await request(
          'POST',
          '/api/farm/score',
          JSON.stringify({ ...input, ruleset }),
        )
        expect(outdated.status).toBe(409)
        expect(outdated.data.error).toContain('刷新页面')
      }
      expect((await request('GET', '/api/farm/leaderboard')).data.total).toBe(0)
      expect((await request('GET', '/api/farm/no-such-route')).status).toBe(404)
      expect((await request('POST', '/api/farm/leaderboard', '{}')).status).toBe(404)
    } finally {
      store.close()
    }
  })
})
