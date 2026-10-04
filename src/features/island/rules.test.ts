import { describe, expect, it } from 'vitest'
import { ISLANDS, act, createJourney, decodeRoute, encodeRoute, journeyStars, playTurn, reachable, replayJourney, validDay } from './rules.mjs'
import { FIRST_SONG_PATH, firstSongStep } from './welcome'
import type { Journey, IslandAction } from './rules.mjs'

function apply(state: Journey, action: IslandAction): Journey {
  const next = act(state, action)
  expect(next).not.toBeNull()
  return next!
}

describe('sound expeditions', () => {
  it('gives the first companion in four guided taps on every daily island', () => {
    for (const day of ['2026-10-03', '2026-10-04', '2026-12-31']) for (const island of ISLANDS) {
      let state = createJourney(island.id, day)
      FIRST_SONG_PATH.forEach((cell, index) => {
        expect(firstSongStep(state)).toBe(index)
        state = playTurn(state, { type: 'move', cell })!
        expect(state).not.toBeNull()
      })
      expect(firstSongStep(state)).toBe(4)
      expect(state.friends).toEqual([1])
      expect(state.actions.at(-1)).toEqual({ type: 'invite' })
      const finished = playTurn(state, { type: 'finish' })!
      expect(replayJourney(island.id, day, finished.actions)).toEqual(finished)
      expect(journeyStars(finished)).toBe(1)
    }
  })
  it('automatically invites friends and celebrates at camp without losing the replay journal', () => {
    let state = createJourney('picnic', '2026-10-03')
    for (const cell of [7, 2, 1, 0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 22, 17, 12]) {
      state = playTurn(state, { type: 'move', cell })!
      expect(state).not.toBeNull()
    }
    expect(state.won).toBe(true)
    expect(state.actions.filter((action) => action.type === 'invite')).toHaveLength(3)
    expect(state.actions.at(-1)).toEqual({ type: 'finish' })
    expect(replayJourney(state.islandId, state.day, state.actions)).toEqual(state)
    expect(playTurn(state, { type: 'finish' })).toBeNull()
  })
  it('uses reproducible daily maps, with a winnable route on every island', () => {
    for (const day of ['2026-10-03', '2026-10-04', '2026-12-31']) for (const island of ISLANDS) {
      let state = createJourney(island.id, day)
      expect(state).toEqual(createJourney(island.id, day))
      for (const cell of [7, 2, 1, 0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 22, 17, 12]) {
        state = apply(state, { type: 'move', cell })
        if ([0, 4, 22].includes(cell)) state = apply(state, { type: 'invite' })
      }
      state = apply(state, { type: 'finish' })
      expect(state.won).toBe(true)
      expect(state.friends).toHaveLength(3)
      expect(journeyStars(state)).toBe(3)
      expect(state.steps).toBeGreaterThanOrEqual(0)
      expect(replayJourney(island.id, day, state.actions)).toEqual(state)
      expect(replayJourney(island.id, day, decodeRoute(encodeRoute(state))!)).toEqual(state)
    }
    expect(createJourney('picnic', '2026-10-03').tiles).not.toEqual(createJourney('picnic', '2026-10-04').tiles)
  })
  it('makes movement consume one step, never collects a tile twice and rejects distant jumps', () => {
    const start = createJourney('picnic', '2026-10-03')
    expect(reachable(start, 0)).toBe(false)
    expect(act(start, { type: 'move', cell: 0 })).toBeNull()
    const first = apply(start, { type: 'move', cell: 11 })
    expect(first.steps).toBe(17)
    expect(first.bag[0]).toBe(1)
    expect(first.melody).toHaveLength(1)
    expect(start.tiles[11].collected).toBe(false)
    const twice = apply(apply(first, { type: 'move', cell: 12 }), { type: 'move', cell: 11 })
    expect(twice.collected).toBe(1)
    expect(twice.bag[0]).toBe(1)
    expect(act({ ...first, steps: 0 }, { type: 'move', cell: 12 })).toBeNull()
  })
  it('trades pocket sounds for limited shortcuts, double collection and rest', () => {
    const start = { ...createJourney('picnic', '2026-10-03'), bag: [2, 2, 2, 2] }
    const skip = apply(start, { type: 'spell', id: 'skip' })
    expect(skip.bag[0]).toBe(1)
    expect(reachable(skip, 2)).toBe(true)
    expect(act(skip, { type: 'spell', id: 'skip' })).toBeNull()
    const jumped = apply(skip, { type: 'move', cell: 2 })
    expect(jumped.skip).toBe(false)
    expect(jumped.steps).toBe(17)
    const bloom = apply(start, { type: 'spell', id: 'bloom' })
    const picked = apply(bloom, { type: 'move', cell: 11 })
    expect(picked.bag[0]).toBe(4)
    expect(picked.bloom).toBe(false)
    const rest = apply(start, { type: 'spell', id: 'rest' })
    expect(rest.steps).toBe(21)
    expect(apply({ ...start, steps: 0 }, { type: 'spell', id: 'rest' }).steps).toBe(3)
    expect(act(rest, { type: 'spell', id: 'rest' })).toBeNull()
    expect(act({ ...start, bag: [0, 0, 0, 0] }, { type: 'spell', id: 'wind' })).toBeNull()
  })
  it('pulls adjacent sounds with wind and turns three distinct voices into a motif', () => {
    const start = createJourney('picnic', '2026-10-03')
    const seeded = { ...start, bag: [0, 0, 0, 1], tiles: start.tiles.map((tile) => tile.cell === 7 ? { ...tile, lane: 1 as const } : tile.cell === 13 ? { ...tile, lane: 3 as const } : tile) }
    const wind = apply(seeded, { type: 'spell', id: 'wind' })
    expect(wind.collected).toBe(4)
    expect(wind.position).toBe(12)
    expect(wind.motifs).toBeGreaterThan(0)
    expect(wind.steps).toBeGreaterThan(18)
    expect(act(wind, { type: 'spell', id: 'wind' })).toBeNull()
  })
  it('requires two sounds at a companion and prevents duplicate invitations', () => {
    const state = { ...createJourney('picnic', '2026-10-03'), position: 0, bag: [0, 1, 0, 0] }
    expect(act(state, { type: 'invite' })).toBeNull()
    const invited = apply({ ...state, bag: [1, 1, 0, 0] }, { type: 'invite' })
    expect(invited.bag).toEqual([0, 0, 0, 0])
    expect(invited.friends).toEqual([1])
    expect(act(invited, { type: 'invite' })).toBeNull()
    expect(act(apply(invited, { type: 'finish' }), { type: 'move', cell: 1 })).toBeNull()
    expect(replayJourney('picnic', state.day, [{ type: 'move', cell: 0 }, { type: 'finish' }])).toBeNull()
    expect(replayJourney('picnic', state.day, [])).toBeNull()
    expect(decodeRoute('invalid!!!')).toBeNull()
    expect(validDay('2026-02-30')).toBe(false)
  })
})
