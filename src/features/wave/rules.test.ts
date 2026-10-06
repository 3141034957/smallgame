import { describe, expect, it } from 'vitest'
import {
  adjacent,
  CHARGE,
  createWave,
  DURATION,
  findMove,
  playWave,
  replayWave,
  validPath,
} from './rules.mjs'
import type { WaveAction } from './rules.mjs'

describe('continuous musical chains', () => {
  it('gives every player the same daily board and a playable first gesture', () => {
    expect(createWave('2026-10-04')).toEqual(createWave('2026-10-04'))
    expect(createWave('2026-10-04').board).not.toEqual(createWave('2026-10-05').board)
    expect(validPath(createWave('2026-10-04').board, [30, 31, 32])).toBe(true)
    expect(adjacent(5, 6)).toBe(false)
    expect(adjacent(0, 7)).toBe(true)
    expect(() => createWave('2026-02-30')).toThrow()
  })
  it('rejects reused, disconnected, mixed-color, undersized and invalid paths', () => {
    const state = createWave('2026-10-04')
    for (const path of [
      null,
      [],
      [30, 31],
      [30, 31, 30],
      [30, 31, 35],
      [30, 31, 36],
      [30, 31, -1],
      [30, 31, 32.1],
    ])
      expect(validPath(state.board, path)).toBeFalsy()
    const mixed = { ...state, board: state.board.map((note) => ({ ...note })) }
    mixed.board[32].lane = 0
    expect(playWave(mixed, { t: 0, path: [30, 31, 32] })).toBeNull()
    for (const t of [-1, 1.5, DURATION, Infinity])
      expect(playWave(state, { t, path: [30, 31, 32] })).toBeNull()
  })
  it('clears immediately, preserves survivors in gravity order, and makes a tappable bomb for six', () => {
    const original = createWave('2026-10-04')
    const snapshot = structuredClone(original)
    const result = playWave(original, { t: 0, path: [30, 31, 32, 33, 34, 35] })!
    expect(original).toEqual(snapshot)
    expect(result.earned).toBe(375)
    expect(result.created).toBe('bomb')
    expect(result.state.board[35].kind).toBe('bomb')
    expect(result.state.board[30].id).toBe(original.board[24].id)
    expect(result.state.board).toHaveLength(36)
    expect(new Set(result.state.board.map((note) => note.id)).size).toBe(36)
    const detonation = playWave(result.state, { t: 700, path: [35] })!
    expect(detonation.triggered).toBe(1)
    expect(detonation.removed).toHaveLength(11)
    expect(detonation.state.bombs).toBe(1)
  })
  it('lets bombs set off other bombs once, and ten-note chains create a color bomb', () => {
    const state = createWave('2026-10-04')
    state.board.forEach((note) => {
      note.lane = 1
    })
    const long = playWave(state, { t: 0, path: [0, 1, 2, 3, 4, 5, 11, 10, 9, 8] })!
    expect(long.created).toBe('rainbow')
    const bomb = createWave('2026-10-04')
    bomb.board[0].kind = 'bomb'
    bomb.board[5].kind = 'bomb'
    const explosion = playWave(bomb, { t: 0, path: [0] })!
    expect(explosion.triggered).toBe(2)
    expect(new Set(explosion.removed).size).toBe(explosion.removed.length)
    expect(explosion.state.bombs).toBe(2)
  })
  it('charges an active boost, consumes it, caps combo multipliers, and resets after inactivity', () => {
    const state = createWave('2026-10-04')
    expect(playWave(state, { t: 0, boost: true })).toBeNull()
    state.charge = CHARGE
    state.combo = 99
    state.lastTime = 0
    const boost = playWave(state, { t: 1000, boost: true })!
    expect(boost.multiplier).toBe(5)
    expect(boost.state.charge).toBe(0)
    expect(boost.state.boosts).toBe(1)
    expect(playWave(boost.state, { t: 1200, boost: true })).toBeNull()
    const next = playWave(boost.state, { t: 4101, path: findMove(boost.state.board)! })!
    expect(next.state.combo).toBe(1)
    expect(playWave(next.state, { t: 4150, path: findMove(next.state.board)! })).toBeNull()
  })
  it('always keeps another move available, and replays a whole round including active boosts', () => {
    let state = createWave('2026-10-04')
    const actions: WaveAction[] = []
    for (let turn = 0; turn < 80; turn++) {
      const action: WaveAction =
        state.charge >= CHARGE
          ? { t: turn * 500, boost: true }
          : { t: turn * 500, path: findMove(state.board)! }
      const result = playWave(state, action)!
      expect(result).not.toBeNull()
      state = result.state
      actions.push(action)
      expect(findMove(state.board)).not.toBeNull()
      expect(state.board).toHaveLength(36)
      expect(new Set(state.board.map((note) => note.id)).size).toBe(36)
    }
    const round = replayWave(state.day, actions)!
    expect(round).toMatchObject({
      score: state.score,
      clears: state.clears,
      boosts: state.boosts,
      maxCombo: 80,
    })
    expect(round.boosts).toBeGreaterThan(0)
    expect(replayWave(state.day, actions)).toEqual(round)
    expect(replayWave(state.day, [])).toBeNull()
    expect(
      replayWave(state.day, [
        { t: 0, path: [30, 31, 32] },
        { t: 0, path: [30, 31, 32] },
      ]),
    ).toBeNull()
  })
})
